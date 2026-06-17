const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 全局状态 ----------
let totalAttempts = 0;
const optimalCache = new Map();     // 已完赛缓存
const upcomingCache = new Map();    // 未开赛缓存（最多4场）
let bestMethod = '胜平负';
let methodStats = {};
let rates = {};
let betSummary = {};
let lastMatchData = {};

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

// ---------- ELO 积分（用于爆冷判定） ----------
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

// ---------- 判断是否为爆冷 ----------
function isUpset(home, away, actualScore, homeOdds, drawOdds, awayOdds) {
    const totalProb = 1/homeOdds + 1/drawOdds + 1/awayOdds;
    const probHome = (1/homeOdds) / totalProb;
    const probDraw = (1/drawOdds) / totalProb;
    const probAway = (1/awayOdds) / totalProb;
    const [h, a] = actualScore.split(':').map(Number);
    let actualProb = 0;
    if (h > a) actualProb = probHome;
    else if (h < a) actualProb = probAway;
    else actualProb = probDraw;
    return actualProb < 0.25;
}

// ---------- 生成模拟赔率（基于ELO） ----------
function generateOdds(home, away) {
    const eloH = getElo(home);
    const eloA = getElo(away);
    const diff = eloH - eloA;
    const pWin = 1 / (1 + Math.exp(-diff/200));
    const pDraw = 0.25 * (1 - Math.abs(diff)/400);
    let pLose = 1 - pWin - pDraw;
    if (pLose < 0.1) pLose = 0.1;
    const total = pWin + pDraw + pLose;
    const oddsWin = 1 / (pWin / total);
    const oddsDraw = 1 / (pDraw / total);
    const oddsLose = 1 / (pLose / total);
    return { win: oddsWin.toFixed(2), draw: oddsDraw.toFixed(2), lose: oddsLose.toFixed(2) };
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

        const matches = data.matches.map(m => {
            const home = nameMap[m.homeTeam?.name] || m.homeTeam?.name || '未知';
            const away = nameMap[m.awayTeam?.name] || m.awayTeam?.name || '未知';
            return {
                home: home,
                away: away,
                homeScore: m.score?.fullTime?.home ?? (m.score?.halfTime?.home ?? null),
                awayScore: m.score?.fullTime?.away ?? (m.score?.halfTime?.away ?? null),
                time: m.utcDate ? new Date(m.utcDate).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                status: m.status || 'SCHEDULED',
                date: m.utcDate || new Date().toISOString()
            };
        });

        const finished = matches.filter(m => m.status === 'FINISHED' && m.homeScore !== null);
        const upcoming = matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED');

        return {
            success: true,
            finished: finished.slice(0, 50), // 确保获取所有已完赛
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

// ---------- 推演已完赛（所有已完赛，每5分钟） ----------
async function runFinishedSimulation() {
    console.log('🔄 [已完赛] 开始推演...');
    try {
        const matchData = await fetchMatchesFromAPI();
        lastMatchData = matchData;
        const finished = matchData.finished || [];
        if (finished.length === 0) {
            console.log('⏸️ [已完赛] 无比赛，跳过');
            return;
        }

        for (const match of finished) {
            const home = match.home;
            const away = match.away;
            const actualScore = `${match.homeScore}:${match.awayScore}`;
            const matchId = `${home}_${away}_${match.date}`;

            console.log(`🔁 [已完赛] 推演 ${home} vs ${away}`);
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
                const odds = generateOdds(home, away);
                const isUpsetFlag = isUpset(home, away, actualScore, parseFloat(odds.win), parseFloat(odds.draw), parseFloat(odds.lose));
                const weight = isUpsetFlag ? 0.5 : 1.0;
                optimalCache.set(matchId, {
                    pred: bestPred,
                    attempt: bestAttempt,
                    score: bestScore,
                    confidence: bestConfidence,
                    weight: weight
                });
                console.log(`✅ [已完赛] 更新: ${home} vs ${away} (第 ${bestAttempt} 次)${isUpsetFlag ? ' [爆冷, 权重0.5]' : ''}`);
            }
        }

        // 更新统计
        updateStatistics(finished);
        console.log(`✅ [已完赛] 完成，总次数: ${totalAttempts}, 缓存: ${optimalCache.size}`);
    } catch (error) {
        console.error('❌ [已完赛] 推演出错:', error);
    }
}

// ---------- 推演未开赛（前4场，每30秒） ----------
async function runUpcomingSimulation() {
    console.log('🔄 [未开赛] 开始推演...');
    try {
        const matchData = lastMatchData; // 使用最新已获取的数据
        const upcoming = matchData.upcoming || [];
        if (upcoming.length === 0) {
            console.log('⏸️ [未开赛] 无比赛，跳过');
            return;
        }

        upcomingCache.clear();
        const upcomingLimit = 4;
        const upcomingSlice = upcoming.slice(0, upcomingLimit);
        for (const match of upcomingSlice) {
            const home = match.home;
            const away = match.away;
            const key = `${home}_${away}`;
            try {
                console.log(`🔮 [未开赛] 预测 ${home} vs ${away}`);
                const pred = await callDeepSeek(home, away);
                upcomingCache.set(key, {
                    pred: pred,
                    confidence: pred.confidence || null,
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ [未开赛] 完成: ${home} vs ${away}`);
            } catch (err) {
                console.warn(`[未开赛] 预测失败 (${home} vs ${away}):`, err.message);
            }
        }
        console.log(`✅ [未开赛] 完成，缓存: ${upcomingCache.size}`);
    } catch (error) {
        console.error('❌ [未开赛] 推演出错:', error);
    }
}

// ---------- 更新统计（考虑爆冷权重） ----------
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
        const weight = cached.weight || 1.0;
        const [h, a] = actualScore.split(':').map(Number);
        const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
        const totalActual = h + a;

        const isSPF = pred.win_draw_lose.prediction === actualSPF;
        stats['胜平负'].correct += isSPF ? weight : 0;
        stats['胜平负'].total += weight;

        const isRQ = pred.handicap.prediction === actualSPF;
        stats['让球胜平负'].correct += isRQ ? weight : 0;
        stats['让球胜平负'].total += weight;

        const predTotal = parseInt(pred.total_goals.prediction);
        const isTG = !isNaN(predTotal) && predTotal === totalActual;
        stats['总进球数'].correct += isTG ? weight : 0;
        stats['总进球数'].total += weight;

        const isHF = pred.half_full.prediction === actualSPF;
        stats['半全场'].correct += isHF ? weight : 0;
        stats['半全场'].total += weight;

        const isCS = pred.correct_score.prediction === actualScore;
        stats['正确比分'].correct += isCS ? weight : 0;
        stats['正确比分'].total += weight;
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

    // ----- 投注汇总（权重不用于投注） -----
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

// ---------- 定时器启动 ----------
function startTimers() {
    // 已完赛：每5分钟（300秒）
    setInterval(async () => {
        await runFinishedSimulation();
    }, 300000);

    // 未开赛：每30秒
    setInterval(async () => {
        await runUpcomingSimulation();
    }, 30000);

    console.log('⏰ 定时器已启动: 已完赛(5分钟), 未开赛(30秒)');
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
            confidence: cached ? cached.confidence : null,
            weight: cached ? cached.weight : 1.0
        };
    });

    const upcomingWithPred = [];
    upcoming.forEach(match => {
        const key = `${match.home}_${match.away}`;
        const cached = upcomingCache.get(key);
        if (cached) {
            upcomingWithPred.push({
                ...match,
                pred: cached.pred,
                confidence: cached.confidence
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
        betSummary: global.betSummary || { totalProfit: 0, methodProfits: {}, dailyProfits: {}, betRecords: [] }
    };

    res.json(state);
});

// ---------- 启动服务 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // 初始获取数据
    const data = await fetchMatchesFromAPI();
    lastMatchData = data;
    // 启动定时器
    startTimers();
    // 立即执行一次推演
    await runFinishedSimulation();
    await runUpcomingSimulation();
});
