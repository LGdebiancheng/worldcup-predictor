const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 全局状态 ----------
let totalAttempts = 0; // 总推演次数
const optimalCache = new Map(); // key: matchId, value: { pred, attempt, score }

// ---------- 模拟数据 ----------
const fallbackData = {
    finished: [
        { home: '巴西', away: '阿根廷', homeScore: 2, awayScore: 1, time: '03:00', status: 'FINISHED', date: '2026-06-17T03:00:00Z' },
        { home: '法国', away: '英格兰', homeScore: 1, awayScore: 1, time: '06:00', status: 'FINISHED', date: '2026-06-17T06:00:00Z' },
        { home: '德国', away: '西班牙', homeScore: 2, awayScore: 3, time: '09:00', status: 'FINISHED', date: '2026-06-17T09:00:00Z' },
        { home: '葡萄牙', away: '荷兰', homeScore: 0, awayScore: 2, time: '12:00', status: 'FINISHED', date: '2026-06-17T12:00:00Z' },
        { home: '意大利', away: '比利时', homeScore: 1, awayScore: 0, time: '15:00', status: 'FINISHED', date: '2026-06-17T15:00:00Z' }
    ],
    upcoming: [
        { home: '美国', away: '墨西哥', homeScore: null, awayScore: null, time: '18:00', status: 'SCHEDULED', date: '2026-06-17T18:00:00Z' },
        { home: '日本', away: '韩国', homeScore: null, awayScore: null, time: '21:00', status: 'SCHEDULED', date: '2026-06-17T21:00:00Z' }
    ]
};

app.get('/api/matches', async (req, res) => {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) {
        console.log('⚠️ FOOTBALL_API_KEY 未设置，返回模拟数据');
        return res.json({ success: true, ...fallbackData });
    }

    try {
        const url = 'https://api.football-data.org/v4/competitions/2000/matches';
        const response = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });

        if (!response.ok) {
            console.log(`⚠️ API 返回 ${response.status}，使用模拟数据`);
            return res.json({ success: true, ...fallbackData });
        }

        const data = await response.json();
        if (!data.matches || data.matches.length === 0) {
            console.log('⚠️ 未获取到比赛，使用模拟数据');
            return res.json({ success: true, ...fallbackData });
        }

        const matches = data.matches.map(m => ({
            home: m.homeTeam?.name || '未知',
            away: m.awayTeam?.name || '未知',
            homeScore: m.score?.fullTime?.home ?? (m.score?.halfTime?.home ?? null),
            awayScore: m.score?.fullTime?.away ?? (m.score?.halfTime?.away ?? null),
            time: m.utcDate ? new Date(m.utcDate).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
            status: m.status || 'SCHEDULED',
            date: m.utcDate || new Date().toISOString()
        }));

        const finished = matches.filter(m => m.status === 'FINISHED' && m.homeScore !== null);
        const upcoming = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED');

        res.json({
            success: true,
            finished: finished.slice(0, 15),
            upcoming: upcoming.slice(0, 15)
        });

    } catch (error) {
        console.error('❌ 获取数据出错:', error.message);
        res.json({ success: true, ...fallbackData });
    }
});

// ---------- 普通预测（未完赛用） ----------
app.post('/api/predict', async (req, res) => {
    const { home, away, matchId } = req.body;
    const API_KEY = process.env.DEEPSEEK_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({
            success: false,
            error: '未设置 DEEPSEEK_API_KEY 环境变量'
        });
    }

    const prompt = `你是足球预测专家。请预测 ${home} vs ${away} 的比赛，只返回JSON：
{
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": ""},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": ""},
  "total_goals": {"prediction": "数字（如0,1,2,3,4,5）", "analysis": ""},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": ""},
  "correct_score": {"prediction": "具体比分如2:1", "analysis": ""}
}`;

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error(`DeepSeek API 错误: ${response.status}`);

        const data = await response.json();
        const json = JSON.parse(data.choices[0].message.content);

        res.json({ success: true, data: json, cached: false });

    } catch (error) {
        console.error('DeepSeek 调用失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- 最优预测（已完赛用，后台自动推演） ----------
app.post('/api/predict_optimal', async (req, res) => {
    const { home, away, actualScore, matchId } = req.body;
    const API_KEY = process.env.DEEPSEEK_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({
            success: false,
            error: '未设置 DEEPSEEK_API_KEY 环境变量'
        });
    }

    // 检查缓存，如果缓存存在且推演编号在最近100次内，直接返回
    if (optimalCache.has(matchId)) {
        const cached = optimalCache.get(matchId);
        if (totalAttempts - cached.attempt <= 100) {
            console.log(`✅ 缓存命中（第 ${cached.attempt} 次推演）: ${home} vs ${away}`);
            return res.json({
                success: true,
                data: cached.pred,
                attempt: cached.attempt,
                totalAttempts: totalAttempts,
                cached: true
            });
        } else {
            console.log(`🔄 缓存过期（第 ${cached.attempt} 次，当前 ${totalAttempts}），重新推演`);
        }
    }

    // 解析实际比分
    const [actualHome, actualAway] = actualScore.split(':').map(Number);
    const actualSPF = actualHome > actualAway ? '主队胜' : (actualHome < actualAway ? '客队胜' : '平局');
    const actualTotal = actualHome + actualAway;

    // 进行多次推演（每次推演消耗API，建议次数适中）
    const times = 5; // 每次请求推演5次，累积总次数
    let bestPred = null;
    let bestScore = -1;
    let bestAttempt = 0;

    for (let i = 0; i < times; i++) {
        totalAttempts++; // 全局递增
        try {
            const prompt = `你是足球预测专家。请预测 ${home} vs ${away} 的比赛，只返回JSON：
{
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": ""},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": ""},
  "total_goals": {"prediction": "数字（如0,1,2,3,4,5）", "analysis": ""},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": ""},
  "correct_score": {"prediction": "具体比分如2:1", "analysis": ""}
}`;

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                console.warn(`第 ${totalAttempts} 次推演失败: ${response.status}`);
                continue;
            }

            const data = await response.json();
            const pred = JSON.parse(data.choices[0].message.content);

            // 计算得分
            let score = 0;
            // 胜平负
            if (pred.win_draw_lose.prediction === actualSPF) score += 1;
            // 总进球
            const predTotal = parseInt(pred.total_goals.prediction);
            if (!isNaN(predTotal) && predTotal === actualTotal) score += 1;
            // 比分完全正确
            if (pred.correct_score.prediction === actualScore) score += 2;

            if (score > bestScore) {
                bestScore = score;
                bestPred = pred;
                bestAttempt = totalAttempts;
            }

        } catch (error) {
            console.warn(`第 ${totalAttempts} 次推演出错:`, error.message);
        }
    }

    if (!bestPred) {
        // 所有推演均失败，返回错误
        return res.status(500).json({ success: false, error: '所有推演均失败' });
    }

    // 缓存最优结果
    optimalCache.set(matchId, {
        pred: bestPred,
        attempt: bestAttempt,
        score: bestScore
    });

    // 可选：限制缓存大小，防止内存泄漏
    if (optimalCache.size > 50) {
        // 删除最旧的一些条目（按推演次数排序）
        const entries = Array.from(optimalCache.entries());
        entries.sort((a, b) => a[1].attempt - b[1].attempt);
        const toRemove = entries.slice(0, entries.length - 40);
        toRemove.forEach(([key]) => optimalCache.delete(key));
    }

    res.json({
        success: true,
        data: bestPred,
        attempt: bestAttempt,
        totalAttempts: totalAttempts,
        cached: false
    });
});

// ---------- 获取全局推演次数 ----------
app.get('/api/total_attempts', (req, res) => {
    res.json({ totalAttempts });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));