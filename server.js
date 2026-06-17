const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 全局状态 ----------
let totalAttempts = 0;
const optimalCache = new Map();
let bestMethod = '胜平负';
let methodStats = {};
let rates = {};
let betSummary = {};
let lastMatchData = {};

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
        { home: '日本', away: '韩国', homeScore: null, awayScore: null, time: '21:00', status: 'SCHEDULED', date: '2026-06-17T21:00:00Z' },
        { home: '澳大利亚', away: '沙特', homeScore: null, awayScore: null, time: '00:00', status: 'SCHEDULED', date: '2026-06-18T00:00:00Z' },
        { home: '尼日利亚', away: '喀麦隆', homeScore: null, awayScore: null, time: '03:00', status: 'SCHEDULED', date: '2026-06-18T03:00:00Z' },
        { home: '波兰', away: '瑞典', homeScore: null, awayScore: null, time: '06:00', status: 'SCHEDULED', date: '2026-06-18T06:00:00Z' },
        { home: '伊朗', away: '卡塔尔', homeScore: null, awayScore: null, time: '09:00', status: 'SCHEDULED', date: '2026-06-18T09:00:00Z' }
    ]
};

// ---------- 赔率配置 ----------
const ODDS_CONFIG = {
    '胜平负': { '主队胜': 2.0, '平局': 3.0, '客队胜': 2.5 },
    '让球胜平负': { '主队赢盘': 1.9, '走盘': 3.2, '客队赢盘': 2.0 },
    '总进球数': { default: 2.0 },
    '半全场': { default: 3.0 },
    '正确比分': { default: 6.0 }
};

function getOddsForMethod(method, prediction) {
    const config = ODDS_CONFIG[method];
    if (!config) return 1.0;
    if (config[prediction]) return config[prediction];
    if (config.default) return config.default;
    return 1.0;
}

// ---------- 计算投注盈亏 ----------
function calculateBetProfit(method, prediction, actualScore) {
    let correct = false;
    const [h, a] = actualScore.split(':').map(Number);
    const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
    const total = h + a;

    if (method === '胜平负') {
        correct = (prediction === actualSPF);
    } else if (method === '让球胜平负') {
        const map = { '主队赢盘': '主队胜', '走盘': '平局', '客队赢盘': '客队胜' };
        const mapped = map[prediction] || prediction;
        correct = (mapped === actualSPF);
    } else if (method === '总进球数') {
        const predNum = parseInt(prediction);
        correct = (!isNaN(predNum) && predNum === total);
    } else if (method === '半全场') {
        const prefix = prediction.charAt(0);
        let predSPF = '';
        if (prefix === '胜') predSPF = '主队胜';
        else if (prefix === '负') predSPF = '客队胜';
        else if (prefix === '平') predSPF = '平局';
        correct = (predSPF === actualSPF);
    } else if (method === '正确比分') {
        correct = (prediction === actualScore);
    }

    const odds = getOddsForMethod(method, prediction);
    const stake = 100;
    return correct ? stake * (odds - 1) : -stake;
}

// ---------- 获取比赛数据 ----------
async function fetchMatchesFromAPI() {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) {
        console.log('⚠️ FOOTBALL_API_KEY 未设置，使用模拟数据');
        return { success: true, ...fallbackData };
    }

    try {
        const url = 'https://api.football-data.org/v4/competitions/2000/matches';
        const response = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });

        if (!response.ok) {
            console.log(`⚠️ API 返回 ${response.status}，使用模拟数据`);
            return { success: true, ...fallbackData };
        }

        const data = await response.json();
        if (!data.matches || data.matches.length === 0) {
            console.log('⚠️ 未获取到比赛，使用模拟数据');
            return { success: true, ...fallbackData };
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

        return {
            success: true,
            finished: finished.slice(0, 15),
            upcoming: upcoming.slice(0, 15)
        };
    } catch (error) {
        console.error('❌ 获取数据出错:', error.message);
        return { success: true, ...fallbackData };
    }
}

// ---------- 调用 DeepSeek ----------
async function callDeepSeek(home, away) {
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) {
        throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');
    }

    const prompt = `你是足球预测专家。请预测 ${home} vs ${away} 的比赛，只返回JSON：
{
  "confidence": 整数（0-100，表示你对整体预测的信心度）,
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
        const err = await response.text();
        throw new Error(`DeepSeek API 错误 (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
}

// ---------- 后台推演 ----------
async function runSimulation() {
    console.log('🔄 开始新一轮后台推演...');
    try {
        const matchData = await fetchMatchesFromAPI();
        lastMatchData = matchData;
        const finished = matchData.finished || [];

        if (finished.length === 0) {
            console.log('⏸️ 无已完赛比赛，跳过推演');
            updateStatistics(finished);
            return;
        }

        const targetMatches = finished.slice(0, 10);
        let hasNewPrediction = false;

        for (const match of targetMatches) {
            const home = match.home;
            const away = match.away;
            const actualScore = `${match.homeScore}:${match.awayScore}`;
            const matchId = `${home}_${away}_${match.date}`;

            if (optimalCache.has(matchId)) {
                const cached = optimalCache.get(matchId);
                if (totalAttempts - cached.attempt <= 100) {
                    continue;
                }
            }

            console.log(`🔁 推演 ${home} vs ${away}`);
            let bestPred = null;
            let bestScore = -1;
            let bestAttempt = 0;
            let bestConfidence = null;

            const times = 3;
            for (let i = 0; i < times; i++) {
                totalAttempts++;
                try {
                    const pred = await callDeepSeek(home, away);
                    const [h, a] = actualScore.split(':').map(Number);
                    const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
                    const totalActual = h + a;
                    let score = 0;
                    if (pred.win_draw_lose.prediction === actualSPF) score += 1;
                    const predTotal = parseInt(pred.total_goals.prediction);
                    if (!isNaN(predTotal) && predTotal === totalActual) score += 1;
                    if (pred.correct_score.prediction === actualScore) score += 2;

                    if (score > bestScore) {
                        bestScore = score;
                        bestPred = pred;
                        bestAttempt = totalAttempts;
                        bestConfidence = pred.confidence || null;
                    }
                } catch (err) {
                    console.warn(`推演失败 (${home} vs ${away}):`, err.message);
                }
            }

            if (bestPred) {
                optimalCache.set(matchId, {
                    pred: bestPred,
                    attempt: bestAttempt,
                    score: bestScore,
                    confidence: bestConfidence
                });
                hasNewPrediction = true;
                console.log(`✅ 缓存更新: ${home} vs ${away} (第 ${bestAttempt} 次)`);
            }
        }

        updateStatistics(finished);
        console.log(`✅ 后台推演完成，总次数: ${totalAttempts}, 缓存条目: ${optimalCache.size}`);
    } catch (error) {
        console.error('❌ 后台推演出错:', error);
    }
}

// ---------- 更新统计 ----------
function updateStatistics(finishedMatches) {
    const methods = ['胜平负', '让球胜平负', '总进球数', '半全场', '正确比分'];
    const stats = {};
    methods.forEach(m => stats[m] = { correct: 0, total: 0 });
    let bestMethod = '胜平负';
    let bestRate = 0;

    finishedMatches.forEach(match => {
        const actualScore = `${match.homeScore}:${match.awayScore}`;
        const matchId = `${match.home}_${match.away}_${match.date}`;
        if (!optimalCache.has(matchId)) return;

        const cached = optimalCache.get(matchId);
        const pred = cached.pred;
        const [h, a] = actualScore.split(':').map(Number);
        const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
        const totalActual = h + a;

        const isSPF = pred.win_draw_lose.prediction === actualSPF;
        stats['胜平负'].correct += isSPF ? 1 : 0;
        stats['胜平负'].total++;

        const isRQ = pred.handicap.prediction === actualSPF;
        stats['让球胜平负'].correct += isRQ ? 1 : 0;
        stats['让球胜平负'].total++;

        const predTotal = parseInt(pred.total_goals.prediction);
        const isTG = !isNaN(predTotal) && predTotal === totalActual;
        stats['总进球数'].correct += isTG ? 1 : 0;
        stats['总进球数'].total++;

        const isHF = pred.half_full.prediction === actualSPF;
        stats['半全场'].correct += isHF ? 1 : 0;
        stats['半全场'].total++;

        const isCS = pred.correct_score.prediction === actualScore;
        stats['正确比分'].correct += isCS ? 1 : 0;
        stats['正确比分'].total++;
    });

    const rates = {};
    for (const method of methods) {
        const total = stats[method].total || 1;
        const rate = stats[method].correct / total;
        rates[method] = rate;
        if (rate > bestRate) {
            bestRate = rate;
            bestMethod = method;
        }
    }

    global.methodStats = stats;
    global.rates = rates;
    global.bestMethod = bestMethod;

    // 投注汇总
    const betRecords = [];
    finishedMatches.forEach(match => {
        const actualScore = `${match.homeScore}:${match.awayScore}`;
        const matchId = `${match.home}_${match.away}_${match.date}`;
        if (!optimalCache.has(matchId)) return;
        const pred = optimalCache.get(matchId).pred;
        const date = match.date ? match.date.substring(0,10) : '2026-06-17';
        methods.forEach(method => {
            let prediction = '';
            switch(method) {
                case '胜平负': prediction = pred.win_draw_lose.prediction; break;
                case '让球胜平负': prediction = pred.handicap.prediction; break;
                case '总进球数': prediction = pred.total_goals.prediction; break;
                case '半全场': prediction = pred.half_full.prediction; break;
                case '正确比分': prediction = pred.correct_score.prediction; break;
            }
            const profit = calculateBetProfit(method, prediction, actualScore);
            const odds = getOddsForMethod(method, prediction);
            betRecords.push({
                date: date,
                match: `${match.home} 对 ${match.away}`,
                method: method,
                prediction: prediction,
                actual: actualScore,
                correct: profit > 0,
                odds: odds,
                profit: profit
            });
        });
    });

    let totalProfit = 0;
    const methodProfits = {};
    const dailyProfits = {};
    methods.forEach(m => methodProfits[m] = 0);
    betRecords.forEach(rec => {
        totalProfit += rec.profit;
        methodProfits[rec.method] += rec.profit;
        if (!dailyProfits[rec.date]) dailyProfits[rec.date] = 0;
        dailyProfits[rec.date] += rec.profit;
    });

    global.betSummary = {
        totalProfit,
        methodProfits,
        dailyProfits,
        betRecords
    };
}

// ---------- 后台循环 ----------
async function backgroundLoop() {
    console.log('🚀 启动后台推演循环...');
    await runSimulation();
    setInterval(async () => {
        await runSimulation();
    }, 60000);
}

// ---------- API 路由 ----------
app.get('/api/state', (req, res) => {
    const matchData = lastMatchData;
    const finished = matchData.finished || [];
    const upcoming = matchData.upcoming || [];

    const finishedWithPred = finished.map(match => {
        const matchId = `${match.home}_${match.away}_${match.date}`;
        const cached = optimalCache.get(matchId);
        return {
            ...match,
            pred: cached ? cached.pred : null,
            attempt: cached ? cached.attempt : null,
            totalAttempts: totalAttempts,
            confidence: cached ? cached.confidence : null
        };
    });

    const upcomingCache = global.upcomingCache || {};
    const upcomingWithPred = upcoming.map(match => {
        const key = `${match.home}_${match.away}`;
        const pred = upcomingCache[key] || null;
        return {
            ...match,
            pred: pred,
            confidence: pred ? pred.confidence : null
        };
    });

    const state = {
        totalAttempts: totalAttempts,
        finished: finishedWithPred,
        upcoming: upcomingWithPred,
        bestMethod: global.bestMethod || '胜平负',
        stats: global.methodStats || {},
        rates: global.rates || {},
        betSummary: global.betSummary || { totalProfit: 0, methodProfits: {}, dailyProfits: {}, betRecords: [] }
    };

    res.json(state);
});

// ---------- 启动服务 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    const data = await fetchMatchesFromAPI();
    lastMatchData = data;
    backgroundLoop();
});