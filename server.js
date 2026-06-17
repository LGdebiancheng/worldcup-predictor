const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 缓存已完赛预测结果（内存缓存，重启即失效，生产可用 Redis） ----------
const predictionCache = new Map(); // key: `${home}_${away}_${date}`

// ---------- 1. 获取真实比赛数据（Football-Data.org） ----------
app.get('/api/matches', async (req, res) => {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ success: false, error: '未设置 FOOTBALL_API_KEY 环境变量' });
    }

    try {
        // 2026 世界杯 competitionId = 2000
        const url = 'https://api.football-data.org/v4/competitions/2000/matches';
        const response = await fetch(url, {
            headers: { 'X-Auth-Token': API_KEY }
        });

        if (!response.ok) {
            throw new Error(`API 错误: ${response.status}`);
        }

        const data = await response.json();
        const matches = data.matches.map(m => ({
            home: m.homeTeam?.name || '未知',
            away: m.awayTeam?.name || '未知',
            homeScore: m.score?.fullTime?.home ?? (m.score?.halfTime?.home ?? null),
            awayScore: m.score?.fullTime?.away ?? (m.score?.halfTime?.away ?? null),
            time: m.utcDate ? new Date(m.utcDate).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
            status: m.status || 'SCHEDULED',
            matchday: m.matchday || 1,
            date: m.utcDate || new Date().toISOString()
        }));

        // 分离已完赛和未开始
        const finished = matches.filter(m => m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null);
        const upcoming = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'IN_PLAY');

        res.json({
            success: true,
            finished: finished,
            upcoming: upcoming
        });

    } catch (error) {
        console.error('获取比赛数据失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- 2. DeepSeek 多玩法预测 ----------
app.post('/api/predict', async (req, res) => {
    const { home, away, matchId } = req.body; // matchId 用于缓存
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ success: false, error: '未设置 DEEPSEEK_API_KEY 环境变量' });
    }

    // 检查缓存（如果提供了 matchId）
    if (matchId && predictionCache.has(matchId)) {
        console.log(`✅ 从缓存读取预测: ${home} vs ${away}`);
        return res.json({ success: true, data: predictionCache.get(matchId), cached: true });
    }

    const prompt = `你是足球预测专家。请根据以下信息预测比赛结果：
主队：${home}，客队：${away}
请以 JSON 格式返回以下字段，只返回JSON，不要其他文字：
{
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": ""},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": ""},
  "total_goals": {"prediction": "大球/小球", "analysis": ""},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": ""},
  "correct_score": {"prediction": "具体比分如 2:1", "analysis": ""}
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
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`DeepSeek API 错误 (${response.status}): ${errText}`);
        }
        const data = await response.json();
        const content = data.choices[0].message.content;
        const json = JSON.parse(content);

        // 存入缓存（如果提供了 matchId）
        if (matchId) {
            predictionCache.set(matchId, json);
            console.log(`💾 缓存预测: ${home} vs ${away}`);
        }

        res.json({ success: true, data: json, cached: false });
    } catch (error) {
        console.error('DeepSeek 调用失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---------- 3. 统计正确率（前端也会计算，这里提供一个简单接口） ----------
app.post('/api/stats', async (req, res) => {
    const { predictions, actuals } = req.body; // 前端传递已完赛的预测与真实结果
    // 实际可放在前端计算，后端仅作为备份
    res.json({ success: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));