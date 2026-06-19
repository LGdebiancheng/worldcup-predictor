const express = require('express');
const path = require('path');
const app = express();

// 引入新增依赖
const axios = require('axios');
const cheerio = require('cheerio');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 全局状态 ----------
let totalAttempts = 0;
const optimalCache = new Map();
const upcomingCache = new Map();
const oddsCache = new Map();
let bestMethod = '胜平负';
let methodStats = {};
let rates = {};
let betSummary = { totalProfit: 0, methodProfits: {}, dailyProfits: {}, betRecords: [] };
let lastMatchData = {};

// 新增：跟踪历史战绩，用于动态调整投注权重
let historicalMethodSuccess = {
    '胜平负': { hits: 0, total: 0 },
    '半全场': { hits: 0, total: 0 },
    '正确比分': { hits: 0, total: 0 },
    '让球胜平负': { hits: 0, total: 0 },
    '总进球数': { hits: 0, total: 0 }
};

// ---------- 中文映射 ----------
const nameMap = {
    'Brazil': '巴西', 'Argentina': '阿根廷', 'France': '法国', 'England': '英格兰',
    'Germany': '德国', 'Spain': '西班牙', 'Portugal': '葡萄牙', 'Netherlands': '荷兰',
    'Italy': '意大利', 'Belgium': '比利时', 'Mexico': '墨西哥', 'Uruguay': '乌拉圭',
    'Croatia': '克罗地亚', 'Denmark': '丹麦', 'Switzerland': '瑞士', 'USA': '美国',
    'Senegal': '塞内加尔', 'Japan': '日本', 'South Korea': '韩国', 'Australia': '澳大利亚',
    'Ecuador': '厄瓜多尔', 'Ghana': '加纳', 'Morocco': '摩洛哥', 'Nigeria': '尼日利亚',
    'Serbia': '塞尔维亚', 'Poland': '波兰', 'Ukraine': '乌克兰', 'Austria': '奥地利',
    'Wales': '威尔士', 'Scotland': '苏格兰', 'Czech Republic': '捷克', 'South Africa': '南非',
    'Canada': '加拿大', 'New Zealand': '新西兰', 'Costa Rica': '哥斯达黎加', 'Panama': '巴拿马',
    'Saudi Arabia': '沙特', 'Iran': '伊朗', 'Qatar': '卡塔尔', 'Cameroon': '喀麦隆',
    'Sweden': '瑞典'
};

const teamNameMapForOdds = {
    '巴西': 'Brazil', '阿根廷': 'Argentina', '法国': 'France', '英格兰': 'England',
    '德国': 'Germany', '西班牙': 'Spain', '葡萄牙': 'Portugal', '荷兰': 'Netherlands',
    '意大利': 'Italy', '比利时': 'Belgium', '墨西哥': 'Mexico', '乌拉圭': 'Uruguay',
    '克罗地亚': 'Croatia', '丹麦': 'Denmark', '瑞士': 'Switzerland', '美国': 'USA',
    '塞内加尔': 'Senegal', '日本': 'Japan', '韩国': 'South Korea', '澳大利亚': 'Australia',
    '厄瓜多尔': 'Ecuador', '加纳': 'Ghana', '摩洛哥': 'Morocco', '尼日利亚': 'Nigeria',
    '塞尔维亚': 'Serbia', '波兰': 'Poland', '乌克兰': 'Ukraine', '奥地利': 'Austria',
    '威尔士': 'Wales', '苏格兰': 'Scotland', '捷克': 'Czech Republic', '南非': 'South Africa',
    '加拿大': 'Canada', '新西兰': 'New Zealand', '哥斯达黎加': 'Costa Rica', '巴拿马': 'Panama',
    '沙特': 'Saudi Arabia', '伊朗': 'Iran', '卡塔尔': 'Qatar', '喀麦隆': 'Cameroon',
    '瑞典': 'Sweden'
};

const eloMap = {
    '巴西': 2100, '阿根廷': 2080, '法国': 2050, '英格兰': 2030,
    '德国': 2000, '西班牙': 1980, '葡萄牙': 1960, '荷兰': 1940,
    '意大利': 1920, '比利时': 1900, '墨西哥': 1880, '乌拉圭': 1860,
    '克罗地亚': 1840, '丹麦': 1820, '瑞士': 1800, '美国': 1780,
    '塞内加尔': 1760, '日本': 1740, '韩国': 1720, '澳大利亚': 1700,
    '厄瓜多尔': 1680, '加纳': 1660, '摩洛哥': 1640, '尼日利亚': 1620,
    '塞尔维亚': 1600, '波兰': 1580, '乌克兰': 1560, '奥地利': 1540,
    '威尔士': 1520, '苏格兰': 1500, '捷克': 1480, '南非': 1460,
    '加拿大': 1440, '新西兰': 1420, '哥斯达黎加': 1400, '巴拿马': 1380,
    '沙特': 1360, '伊朗': 1340, '卡塔尔': 1320, '喀麦隆': 1300,
    '瑞典': 1280
};
const DEFAULT_ELO = 1500;

function getElo(team) {
    return eloMap[team] || DEFAULT_ELO;
}

// ---------- 模拟数据 ----------
const fallbackData = {
    finished: [
        { home: '巴西', away: '阿根廷', homeScore: 2, awayScore: 1, time: '03:00', status: 'FINISHED', date: '2026-06-17T03:00:00Z' },
        { home: '法国', away: '英格兰', homeScore: 1, awayScore: 1, time: '06:00', status: 'FINISHED', date: '2026-06-17T06:00:00Z' }
    ],
    upcoming: [
        { home: '美国', away: '墨西哥', homeScore: null, awayScore: null, time: '18:00', status: 'SCHEDULED', date: '2026-06-17T18:00:00Z' },
        { home: '日本', away: '韩国', homeScore: null, awayScore: null, time: '21:00', status: 'SCHEDULED', date: '2026-06-17T21:00:00Z' }
    ]
};

// ---------- 赔率获取 (保留原逻辑) ----------
async function fetchRealOdds(home, away) {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) return null;
    const homeEn = teamNameMapForOdds[home] || home;
    const awayEn = teamNameMapForOdds[away] || away;
    try {
        const searchUrl = `https://v3.football.api-sports.io/fixtures?team=${encodeURIComponent(homeEn)}&season=2026`;
        const searchResp = await fetch(searchUrl, { headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' } });
        if (!searchResp.ok) return null;
        const searchData = await searchResp.json();
        if (!searchData.response || searchData.response.length === 0) return null;
        let fixture = null;
        for (const item of searchData.response) {
            const teams = item.teams;
            if ((teams.home.name === homeEn || teams.away.name === awayEn) || (teams.home.name.includes(homeEn) && teams.away.name.includes(awayEn))) {
                fixture = item; break;
            }
        }
        if (!fixture) return null;
        const fixtureId = fixture.fixture.id;
        const oddsUrl = `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`;
        const oddsResp = await fetch(oddsUrl, { headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' } });
        if (!oddsResp.ok) return null;
        const oddsData = await oddsResp.json();
        if (!oddsData.response || oddsData.response.length === 0) return null;
        const bookmaker = oddsData.response[0].bookmakers[0];
        if (!bookmaker) return null;
        let win = 2.0, draw = 3.0, lose = 2.5, h_odds = 1.9, d_odds = 3.2, a_odds = 2.0, total_odds = 1.9;
        for (const bet of bookmaker.bets) {
            if (bet.id === 1) {
                for (const value of bet.values) {
                    if (value.value === 'Home') win = parseFloat(value.odd);
                    else if (value.value === 'Draw') draw = parseFloat(value.odd);
                    else if (value.value === 'Away') lose = parseFloat(value.odd);
                }
            } else if (bet.id === 2) {
                for (const value of bet.values) {
                    if (value.value === 'Home') h_odds = parseFloat(value.odd);
                    else if (value.value === 'Away') a_odds = parseFloat(value.odd);
                    else d_odds = parseFloat(value.odd);
                }
            } else if (bet.id === 3) {
                for (const value of bet.values) {
                    total_odds = parseFloat(value.odd);
                }
            }
        }
        return { win: win.toFixed(2), draw: draw.toFixed(2), lose: lose.toFixed(2), h_odds: h_odds.toFixed(2), d_odds: d_odds.toFixed(2), a_odds: a_odds.toFixed(2), total_odds: total_odds.toFixed(2), handicap: '0', from_real: true };
    } catch (error) {
        return null;
    }
}

async function getOdds(home, away, isFinished = false) {
    const key = `${home}_${away}`;
    const cached = oddsCache.get(key);
    const now = Date.now();
    const ttl = isFinished ? 86400000 : 10800000; 
    if (cached && (now - cached.timestamp) < ttl) return cached.odds;

    const realOdds = await fetchRealOdds(home, away);
    if (realOdds) {
        oddsCache.set(key, { odds: realOdds, timestamp: now });
        return realOdds;
    }

    const eloH = getElo(home); const eloA = getElo(away);
    const diff = eloH - eloA;
    const pWin = 1 / (1 + Math.exp(-diff/200));
    const pDraw = 0.25 * (1 - Math.abs(diff)/400);
    let pLose = 1 - pWin - pDraw;
    if (pLose < 0.1) pLose = 0.1;
    const total = pWin + pDraw + pLose;
    const odds = {
        win: (1 / (pWin / total)).toFixed(2), draw: (1 / (pDraw / total)).toFixed(2), lose: (1 / (pLose / total)).toFixed(2),
        h_odds: (1 / (pWin / total) * 0.95).toFixed(2), d_odds: (1 / (pDraw / total) * 0.95).toFixed(2), a_odds: (1 / (pLose / total) * 0.95).toFixed(2),
        total_odds: (1.9).toFixed(2), handicap: '0', from_real: false
    };
    oddsCache.set(key, { odds, timestamp: now });
    return odds;
}

// ---------- 免费爬取赛前情报 (RAG) ----------
async function getMatchContext(home, away) {
    try {
        const eloH = getElo(home);
        const eloA = getElo(away);
        return `近期状态分析：主队 ${home} 的球场实力评分为 ${eloH}，客队 ${away} 的球场实力评分为 ${eloA}。如果分差较大，强队大概率掌控场面。`;
    } catch (err) {
        return '';
    }
}

// ---------- 泊松分布数学计算 ----------
function calculatePoissonProbabilities(home, away) {
    const eloH = getElo(home);
    const eloA = getElo(away);
    const lambdaHome = Math.max(0.5, 0.8 + (eloH - eloA) / 600);
    const lambdaAway = Math.max(0.5, 0.8 - (eloH - eloA) / 600);
    const halfHomeProb = lambdaHome / (lambdaHome + lambdaAway + 1);
    const halfAwayProb = lambdaAway / (lambdaHome + lambdaAway + 1);
    return {
        mathConfidence: 0.7,
        predictedHalf: halfHomeProb > 0.45 ? '主队领先' : (halfAwayProb > 0.45 ? '客队领先' : '半场平局')
    };
}

// ---------- DeepSeek 调用 ----------
async function callDeepSeek(home, away, context) {
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');
    const prompt = `你是顶级的足球预测专家。赛前最新情报：${context}。请严格针对 ${home} vs ${away} 的比赛进行深度分析。
**分析重点：** 深度剖析两支球队的"上半场战术"以及"全场战术"。
**最关注的玩法是：** ① 半全场； ② 正确比分。
请返回JSON结构：
{
  "confidence": 整数(0-100),
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": ""},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": ""},
  "total_goals": {"prediction": "数字", "analysis": ""},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": "重点分析"},
  "correct_score": {"prediction": "具体比分如2:1", "analysis": "重点分析"}
}`;
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.7, response_format: { type: "json_object" } })
    });
    if (!response.ok) { const err = await response.text(); throw new Error(`DeepSeek API 错误 (${response.status}): ${err}`); }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

// ---------- 比赛获取与推演 ----------
async function fetchMatchesFromAPI() {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) return { success: true, ...fallbackData };
    try {
        const url = 'https://api.football-data.org/v4/competitions/2000/matches';
        const response = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
        if (!response.ok) return { success: true, ...fallbackData };
        const data = await response.json();
        if (!data.matches || data.matches.length === 0) return { success: true, ...fallbackData };
        const matches = data.matches.map(m => {
            const home = nameMap[m.homeTeam?.name] || m.homeTeam?.name || '未知';
            const away = nameMap[m.awayTeam?.name] || m.awayTeam?.name || '未知';
            return { home, away, homeScore: m.score?.fullTime?.home ?? null, awayScore: m.score?.fullTime?.away ?? null, time: m.utcDate ? new Date(m.utcDate).toLocaleTimeString('zh-CN') : '--:--', status: m.status || 'SCHEDULED', date: m.utcDate || new Date().toISOString() };
        });
        return { success: true, finished: matches.filter(m => m.status === 'FINISHED').slice(0, 50), upcoming: matches.filter(m => m.status === 'SCHEDULED').slice(0, 15) };
    } catch (error) {
        return { success: true, ...fallbackData };
    }
}

// ---------- 已完赛推演 ----------
async function runFinishedSimulation() {
    const matchData = lastMatchData;
    const finished = matchData.finished || [];
    for (const match of finished) {
        const home = match.home; const away = match.away;
        const actualScore = `${match.homeScore}:${match.awayScore}`;
        const matchId = `${home}_${away}_${match.date}`;
        let bestScore = -1, bestPred = null;
        const times = 3;
        for (let i = 0; i < times; i++) {
            totalAttempts++;
            try {
                const context = await getMatchContext(home, away);
                const pred = await callDeepSeek(home, away, context);
                const [h, a] = actualScore.split(':').map(Number);
                const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
                let score = 0;
                if (pred.win_draw_lose.prediction === actualSPF) score += 1;
                const predTotal = parseInt(pred.total_goals.prediction);
                if (!isNaN(predTotal) && predTotal === h + a) score += 1;
                if (pred.half_full.prediction === actualSPF) score += 2; // 核心
                if (pred.correct_score.prediction === actualScore) score += 3; // 核心
                if (score > bestScore) { bestScore = score; bestPred = pred; }
            } catch (err) { console.warn(`推演失败 ${home} vs ${away}:`, err.message); }
        }
        if (bestPred) {
            const odds = await getOdds(home, away, true);
            optimalCache.set(matchId, { pred: bestPred, score: bestScore, odds: odds });
        }
    }
    updateStatistics(finished);
}

// ---------- 动态投注权重生成 ----------
function calculateOptimalCombo(matches) {
    const weights = { '半全场': 1, '胜平负': 1, '正确比分': 1 };
    const methodStats = global.historicalMethodSuccess || {};
    for (const [method, data] of Object.entries(methodStats)) {
        if (data.total > 5) {
            const successRate = data.hits / data.total;
            if (successRate < 0.4) weights[method] = 0.5;
            else if (successRate > 0.6) weights[method] = 1.5;
        }
    }

    const A = matches[0], B = matches[1], C = matches[2], D = matches[3];
    const getOdd = (match) => {
        if (match.finalPrediction.method === '半全场' || match.finalPrediction.method === '胜平负') {
            if (match.finalPrediction.prediction.includes('主队胜') || match.finalPrediction.prediction === '胜胜') return parseFloat(match.odds.win) || 2.0;
            if (match.finalPrediction.prediction.includes('客队胜') || match.finalPrediction.prediction === '负负') return parseFloat(match.odds.lose) || 2.5;
            return parseFloat(match.odds.draw) || 3.0;
        } else if (match.finalPrediction.method === '正确比分') {
            return 6.0;
        }
        return 1.0;
    };

    const wA = weights[A.finalPrediction.method] || 1.0;
    const wB = weights[B.finalPrediction.method] || 1.0;
    const wC = weights[C.finalPrediction.method] || 1.0;
    const wD = weights[D.finalPrediction.method] || 1.0;
    
    const baseSingle = 8, baseDouble = 14, baseTriple = 10;
    const combos = [
        { name: `单关:${A.home}`, fields: [A], amount: Math.round(baseSingle * wA) },
        { name: `单关:${B.home}`, fields: [B], amount: Math.round(baseSingle * wB) },
        { name: `单关:${C.home}`, fields: [C], amount: Math.round(baseSingle * wC) },
        { name: `单关:${D.home}`, fields: [D], amount: Math.round(baseSingle * wD) },
        { name: `2串1:A+B`, fields: [A,B], amount: Math.round(baseDouble * (wA + wB)/2) },
        { name: `2串1:A+C`, fields: [A,C], amount: Math.round(10 * (wA + wC)/2) },
        { name: `2串1:B+C`, fields: [B,C], amount: Math.round(10 * (wB + wC)/2) },
        { name: `2串1:C+D`, fields: [C,D], amount: Math.round(4 * (wC + wD)/2) },
        { name: `3串1:A+B+C`, fields: [A,B,C], amount: Math.round(baseTriple * (wA + wB + wC)/3) },
        { name: `4串1:A+B+C+D`, fields: [A,B,C,D], amount: 2 }
    ];
    return combos;
}

// ---------- 更新统计 ----------
function updateStatistics(finishedMatches) {
    const methods = ['胜平负', '半全场', '正确比分'];
    const stats = {};
    methods.forEach(m => stats[m] = { correct: 0, total: 0 });
    let bestMethod = '胜平负'; let bestRate = 0;

    for (const match of finishedMatches) {
        const actualScore = `${match.homeScore}:${match.awayScore}`;
        const matchId = `${match.home}_${match.away}_${match.date}`;
        if (!optimalCache.has(matchId)) continue;
        const cached = optimalCache.get(matchId);
        const pred = cached.pred;
        const [h, a] = actualScore.split(':').map(Number);
        const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');

        const methodsToCheck = {
            '胜平负': pred.win_draw_lose.prediction === actualSPF,
            '半全场': pred.half_full.prediction === actualSPF,
            '正确比分': pred.correct_score.prediction === actualScore
        };
        
        for (const [method, isCorrect] of Object.entries(methodsToCheck)) {
            stats[method].total += 1;
            if (isCorrect) stats[method].correct += 1;
        }
    }

    const rates = {};
    for (const method of methods) {
        const total = stats[method].total || 1;
        const rate = stats[method].correct / total;
        rates[method] = rate;
        if (rate > bestRate) { bestRate = rate; bestMethod = method; }
        global.historicalMethodSuccess[method] = { hits: stats[method].correct, total: stats[method].total };
    }
    global.methodStats = stats; global.rates = rates; global.bestMethod = bestMethod;
}

// ---------- 未开赛推演（核心聚合） ----------
async function runUpcomingSimulation() {
    const matchData = lastMatchData;
    const upcoming = matchData.upcoming || [];
    if (upcoming.length === 0) return;

    const historicalBestMethod = global.bestMethod || '半全场'; 
    const upcomingLimit = 4;
    const upcomingSlice = upcoming.slice(0, upcomingLimit);
    const matchPredictions = [];

    for (const match of upcomingSlice) {
        const home = match.home; const away = match.away;
        const key = `${home}_${away}`;
        try {
            const context = await getMatchContext(home, away);
            const predDeepSeek = await callDeepSeek(home, away, context);
            const mathResult = calculatePoissonProbabilities(home, away);

            let finalPredJson = predDeepSeek;
            let confidenceMultiplier = 1.0;
            if (mathResult.mathConfidence > 0.7) confidenceMultiplier = 1.2;

            let cacheEntry = upcomingCache.get(key) || { latest: null, best: null };
            cacheEntry.latest = { pred: finalPredJson, timestamp: new Date() };
            
            const adjustedConfidence = Math.min(100, (finalPredJson.confidence || 50) * confidenceMultiplier);
            if (!cacheEntry.best || (cacheEntry.best.confidence || 0) < adjustedConfidence) {
                cacheEntry.best = { pred: finalPredJson, confidence: adjustedConfidence };
            }

            const odds = await getOdds(home, away, false);
            cacheEntry.odds = odds;
            
            let finalPred = {};
            const targetMethod = historicalBestMethod;
            if (targetMethod === '半全场') {
                finalPred = { method: '半全场', prediction: cacheEntry.best.pred.half_full.prediction, analysis: cacheEntry.best.pred.half_full.analysis };
            } else if (targetMethod === '正确比分') {
                finalPred = { method: '正确比分', prediction: cacheEntry.best.pred.correct_score.prediction, analysis: cacheEntry.best.pred.correct_score.analysis };
            } else {
                finalPred = { method: targetMethod, prediction: cacheEntry.best.pred.win_draw_lose.prediction };
            }
            cacheEntry.finalMethod = finalPred;
            upcomingCache.set(key, cacheEntry);
            matchPredictions.push({ home, away, matchKey: key, odds, finalPrediction: finalPred });
        } catch (err) { console.warn(`[未开赛] 预测失败: ${err.message}`); }
    }

    if (matchPredictions.length === 4) {
        const betCombo = calculateOptimalCombo(matchPredictions);
        global.upcomingBets = betCombo;
    }
}

// ---------- 定时器 ----------
function startTimers() {
    setInterval(async () => { await runFinishedSimulation(); }, 300000);
    setInterval(async () => { await runUpcomingSimulation(); }, 120000);
}

// ---------- API ----------
app.get('/api/state', (req, res) => {
    const matchData = lastMatchData;
    const finished = matchData.finished || [];
    const upcoming = matchData.upcoming || [];

    const finishedWithPred = finished.map(match => {
        const matchId = `${match.home}_${match.away}_${match.date}`;
        const cached = optimalCache.get(matchId);
        return { ...match, pred: cached ? cached.pred : null, odds: cached ? cached.odds : null };
    });

    const upcomingWithPred = [];
    upcoming.forEach(match => {
        const key = `${match.home}_${match.away}`;
        const cached = upcomingCache.get(key);
        if (cached) {
            upcomingWithPred.push({
                ...match,
                best: cached.best ? { pred: cached.best.pred, confidence: cached.best.confidence } : null,
                odds: cached.odds || null,
                finalMethod: cached.finalMethod || null
            });
        }
    });

    const state = {
        totalAttempts: totalAttempts,
        finished: finishedWithPred,
        upcoming: upcomingWithPred,
        bestMethod: global.bestMethod || '胜平负',
        stats: global.methodStats || {},
        rates: global.rates || {},
        upcomingBets: global.upcomingBets || [],
        betSummary: global.betSummary || { totalProfit: 0 }
    };
    res.json(state);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    const data = await fetchMatchesFromAPI();
    lastMatchData = data;
    startTimers();
    await runFinishedSimulation();
    await runUpcomingSimulation();
    console.log(`🚀 Server running on port ${PORT}`);
});
