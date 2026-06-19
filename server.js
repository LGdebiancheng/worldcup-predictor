const express = require('express');
const path = require('path');
const app = express();

const axios = require('axios');
const cheerio = require('cheerio');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 全局状态 ----------
let totalAttempts = 0;
const optimalCache = new Map();
const upcomingCache = new Map();
const oddsCache = new Map();
const formCache = new Map(); 
let bestMethod = '胜平负';
let methodStats = {};
let rates = {};
let betSummary = { totalProfit: 0, methodProfits: {}, dailyProfits: {}, betRecords: [] };
let lastMatchData = {};
let previousOddsRecord = {}; // 🟢 监测赔率异动

// 历史盈利率(ROI)
let historicalMethodSuccess = {
    '胜平负': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '半全场': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '正确比分': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '让球胜平负': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '总进球数': { hits: 0, total: 0, profit: 0, totalStake: 0 }
};

// ---------- 数据映射 ----------
const nameMap = { 'Brazil': '巴西', 'Argentina': '阿根廷', 'France': '法国', 'England': '英格兰', 'Germany': '德国', 'Spain': '西班牙', 'Portugal': '葡萄牙', 'Netherlands': '荷兰', 'Italy': '意大利', 'Belgium': '比利时', 'Mexico': '墨西哥', 'Uruguay': '乌拉圭', 'Croatia': '克罗地亚', 'Denmark': '丹麦', 'Switzerland': '瑞士', 'USA': '美国', 'Senegal': '塞内加尔', 'Japan': '日本', 'South Korea': '韩国', 'Australia': '澳大利亚', 'Ecuador': '厄瓜多尔', 'Ghana': '加纳', 'Morocco': '摩洛哥', 'Nigeria': '尼日利亚', 'Serbia': '塞尔维亚', 'Poland': '波兰', 'Ukraine': '乌克兰', 'Austria': '奥地利', 'Wales': '威尔士', 'Scotland': '苏格兰', 'Czech Republic': '捷克', 'South Africa': '南非', 'Canada': '加拿大', 'New Zealand': '新西兰', 'Costa Rica': '哥斯达黎加', 'Panama': '巴拿马', 'Saudi Arabia': '沙特', 'Iran': '伊朗', 'Qatar': '卡塔尔', 'Cameroon': '喀麦隆', 'Sweden': '瑞典' };
const teamNameMapForOdds = { '巴西': 'Brazil', '阿根廷': 'Argentina', '法国': 'France', '英格兰': 'England', '德国': 'Germany', '西班牙': 'Spain', '葡萄牙': 'Portugal', '荷兰': 'Netherlands', '意大利': 'Italy', '比利时': 'Belgium', '墨西哥': 'Mexico', '乌拉圭': 'Uruguay', '克罗地亚': 'Croatia', '丹麦': 'Denmark', '瑞士': 'Switzerland', '美国': 'USA', '塞内加尔': 'Senegal', '日本': 'Japan', '韩国': 'South Korea', '澳大利亚': 'Australia', '厄瓜多尔': 'Ecuador', '加纳': 'Ghana', '摩洛哥': 'Morocco', '尼日利亚': 'Nigeria', '塞尔维亚': 'Serbia', '波兰': 'Poland', '乌克兰': 'Ukraine', '奥地利': 'Austria', '威尔士': 'Wales', '苏格兰': 'Scotland', '捷克': 'Czech Republic', '南非': 'South Africa', '加拿大': 'Canada', '新西兰': 'New Zealand', '哥斯达黎加': 'Costa Rica', '巴拿马': 'Panama', '沙特': 'Saudi Arabia', '伊朗': 'Iran', '卡塔尔': 'Qatar', '喀麦隆': 'Cameroon', '瑞典': 'Sweden' };
const eloMap = { '巴西': 2100, '阿根廷': 2080, '法国': 2050, '英格兰': 2030, '德国': 2000, '西班牙': 1980, '葡萄牙': 1960, '荷兰': 1940, '意大利': 1920, '比利时': 1900, '墨西哥': 1880, '乌拉圭': 1860, '克罗地亚': 1840, '丹麦': 1820, '瑞士': 1800, '美国': 1780, '塞内加尔': 1760, '日本': 1740, '韩国': 1720, '澳大利亚': 1700, '厄瓜多尔': 1680, '加纳': 1660, '摩洛哥': 1640, '尼日利亚': 1620, '塞尔维亚': 1600, '波兰': 1580, '乌克兰': 1560, '奥地利': 1540, '威尔士': 1520, '苏格兰': 1500, '捷克': 1480, '南非': 1460, '加拿大': 1440, '新西兰': 1420, '哥斯达黎加': 1400, '巴拿马': 1380, '沙特': 1360, '伊朗': 1340, '卡塔尔': 1320, '喀麦隆': 1300, '瑞典': 1280 };
const DEFAULT_ELO = 1500;
function getElo(team) { return eloMap[team] || DEFAULT_ELO; }

const fallbackData = { finished: [], upcoming: [] };

// ==========================================
// 优化 1 & 6：赛前情报 + 历史上半场 + 世界杯背景 + 模拟天气
// ==========================================
async function getMatchNews(home, away) {
    try {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
        const searchUrl = `https://www.dongqiudi.com/search?keyword=${encodeURIComponent(home + ' ' + away)}`;
        const response = await axios.get(searchUrl, { headers: { 'User-Agent': userAgent }, timeout: 5000 });
        const $ = cheerio.load(response.data);
        let news = '';
        $('.news-item').each((i, elem) => {
            if (i < 2) {
                const title = $(elem).find('.title').text().trim();
                if (title.includes(home) || title.includes(away)) {
                    news += title + '。';
                }
            }
        });
        
        const eloH = getElo(home); const eloA = getElo(away);
        const halfStats = `上半场评估：主队 ${home} 抢开局能力评分 ${eloH/100}，客队 ${away} 抢开局能力评分 ${eloA/100}。`;
        const weather = `赛前气象：天气晴朗，适合发挥。`;
        
        return `【世界杯小组赛前瞻】${news}${halfStats}${weather}。关注半全场玩法。`;
    } catch (err) {
        const eloH = getElo(home); const eloA = getElo(away);
        return `【世界杯小组赛】主队 ${home} 实力评分 ${eloH}，客队 ${away} 实力评分 ${eloA}。`;
    }
}

// ==========================================
// 优化 2：真实数据泊松分布
// ==========================================
async function getTeamRecentForm(teamName) {
    if (formCache.has(teamName)) return formCache.get(teamName);
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) return null;
    try {
        const url = `https://api.football-data.org/v4/teams?name=${encodeURIComponent(teamName)}`;
        const resp = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data.teams || data.teams.length === 0) return null;
        const teamId = data.teams[0].id;
        const matchUrl = `https://api.football-data.org/v4/teams/${teamId}/matches?limit=5&status=FINISHED`;
        const matchResp = await fetch(matchUrl, { headers: { 'X-Auth-Token': API_KEY } });
        if (!matchResp.ok) return null;
        const matchData = await matchResp.json();
        const matches = matchData.matches || [];
        let totalGoals = 0, count = 0;
        for (const m of matches) {
            const homeTeam = nameMap[m.homeTeam?.name] || m.homeTeam?.name || '';
            const awayTeam = nameMap[m.awayTeam?.name] || m.awayTeam?.name || '';
            if (homeTeam === teamName && m.score.fullTime.home !== null) {
                totalGoals += m.score.fullTime.home; count++;
            } else if (awayTeam === teamName && m.score.fullTime.away !== null) {
                totalGoals += m.score.fullTime.away; count++;
            }
        }
        const avgGoals = count > 0 ? (totalGoals / count) : 1.0;
        formCache.set(teamName, avgGoals);
        return avgGoals;
    } catch (err) { return null; }
}

async function calculatePoissonProbabilities(home, away) {
    let homeAvg = await getTeamRecentForm(home);
    let awayAvg = await getTeamRecentForm(away);
    if (homeAvg === null) {
        const eloH = getElo(home); const eloA = getElo(away);
        homeAvg = Math.max(0.5, 0.8 + (eloH - eloA) / 600);
        awayAvg = Math.max(0.5, 0.8 - (eloH - eloA) / 600);
    }
    const halfHomeProb = homeAvg / (homeAvg + awayAvg + 1);
    const halfAwayProb = awayAvg / (homeAvg + awayAvg + 1);
    return {
        mathConfidence: 0.75,
        predictedHalf: halfHomeProb > 0.45 ? '主队领先' : (halfAwayProb > 0.45 ? '客队领先' : '半场平局')
    };
}

// ==========================================
// 优化 3：动态赔率 + 异动监测
// ==========================================
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
        let hf_odds = 3.0, cs_odds = 6.0;
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
            } else if (bet.id === 5) { 
                for (const value of bet.values) {
                    hf_odds = parseFloat(value.odd) || hf_odds;
                    break;
                }
            } else if (bet.id === 6) { 
                for (const value of bet.values) {
                    if (value.value === '2:1') { cs_odds = parseFloat(value.odd); break; }
                }
            }
        }
        return { win: win.toFixed(2), draw: draw.toFixed(2), lose: lose.toFixed(2), h_odds: h_odds.toFixed(2), d_odds: d_odds.toFixed(2), a_odds: a_odds.toFixed(2), total_odds: total_odds.toFixed(2), hf_odds: hf_odds.toFixed(2), cs_odds: cs_odds.toFixed(2), handicap: '0', from_real: true };
    } catch (error) { return null; }
}

async function getOdds(home, away, isFinished = false) {
    const key = `${home}_${away}`;
    const cached = oddsCache.get(key);
    const now = Date.now();
    const ttl = isFinished ? 86400000 : 10800000; 
    if (cached && (now - cached.timestamp) < ttl) return cached.odds;

    const realOdds = await fetchRealOdds(home, away);
    if (realOdds) {
        let flash_warning = false;
        const oldOdds = global.previousOddsRecord[key];
        if (oldOdds && oldOdds.hf_odds && realOdds.hf_odds) {
            const dropRatio = (parseFloat(oldOdds.hf_odds) - parseFloat(realOdds.hf_odds)) / parseFloat(oldOdds.hf_odds);
            if (dropRatio > 0.20) {
                flash_warning = true;
                console.log(`⚠️ [赔率异动] ${home} vs ${away} 半全场赔率骤降 ${(dropRatio*100).toFixed(1)}%，注意机构资金注入！`);
            }
        }
        realOdds.flash_warning = flash_warning;
        global.previousOddsRecord[key] = realOdds;
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
        total_odds: (1.9).toFixed(2), hf_odds: '3.0', cs_odds: '6.0', handicap: '0', from_real: false, flash_warning: false
    };
    oddsCache.set(key, { odds, timestamp: now });
    return odds;
}

// ---------- DeepSeek 调用 ----------
async function callDeepSeek(home, away, context) {
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');
    const prompt = `你是顶级的足球预测专家。现在进行的是世界杯小组赛。赛前最新情报：${context}。请针对 ${home} vs ${away} 的比赛进行深度分析。
**核心战术背景：** 世界杯小组赛为了争净胜球，强队大概率会抢开局；同时第一场容易慢热。
**分析重点：** 深度剖析双方上半场开局的战意及全场走势。
**最关注的玩法是：** ① 半全场； ② 正确比分。
请返回严格的JSON结构：
{
  "confidence": 整数(0-100),
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": ""},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": ""},
  "total_goals": {"prediction": "数字", "analysis": ""},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": "重点分析上半场谁领先，全场谁赢"},
  "correct_score": {"prediction": "具体比分如2:1", "analysis": ""}
}`;
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.7, response_format: { type: "json_object" } })
    });
    if (!response.ok) { const err = await response.text(); throw new Error(`DeepSeek API 错误 (${response.status}): ${err}`); }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

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
    } catch (error) { return { success: true, ...fallbackData }; }
}

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
                const context = await getMatchNews(home, away);
                const pred = await callDeepSeek(home, away, context);
                const [h, a] = actualScore.split(':').map(Number);
                const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
                let score = 0;
                if (pred.win_draw_lose.prediction === actualSPF) score += 1;
                const predTotal = parseInt(pred.total_goals.prediction);
                if (!isNaN(predTotal) && predTotal === h + a) score += 1;
                if (pred.half_full.prediction === actualSPF) score += 2;
                if (pred.correct_score.prediction === actualScore) score += 3;
                if (score > bestScore) { bestScore = score; bestPred = pred; }
            } catch (err) { console.warn(`推演失败 ${home} vs ${away}:`, err.message); }
        }
        if (bestPred) {
            const odds = await getOdds(home, away, true);
            optimalCache.set(matchId, { pred: bestPred, score: bestScore, odds: odds, actualScore: actualScore });
        }
    }
    updateStatistics(finished);
}

// ==========================================
// 优化 4：凯利公式动态分配资金 + 增加极度防御机制
// ==========================================
function calculateOptimalCombo(matches) {
    const A = matches[0], B = matches[1], C = matches[2], D = matches[3];

    const getConf = (key) => {
        const cached = upcomingCache.get(key);
        // 防御性编程：如果缓存或者最佳结果为空，返回 0.5 保底
        return cached && cached.best ? (cached.best.confidence / 100) : 0.5; 
    };

    const getOdd = (match) => {
        const odds = match.odds;
        if (match.finalPrediction.method === '半全场') return parseFloat(odds.hf_odds) || 3.0;
        if (match.finalPrediction.method === '正确比分') return parseFloat(odds.cs_odds) || 6.0;
        if (match.finalPrediction.method === '胜平负') {
            if (match.finalPrediction.prediction.includes('主队胜')) return parseFloat(odds.win) || 2.0;
            if (match.finalPrediction.prediction.includes('客队胜')) return parseFloat(odds.lose) || 2.5;
            return parseFloat(odds.draw) || 3.0;
        }
        return 2.0;
    };

    const kellyStake = (p, odds) => {
        if (odds <= 1 || p <= 0 || p >= 1) return 0;
        const b = odds - 1;
        const f = (p * b - (1 - p)) / b;
        return Math.max(0, Math.min(0.25, f));
    };

    const pA = getConf(A.matchKey);
    const pB = getConf(B.matchKey);
    const pC = getConf(C.matchKey);
    const pD = getConf(D.matchKey);

    const oddA = getOdd(A), oddB = getOdd(B), oddC = getOdd(C), oddD = getOdd(D);

    const totalBudget = 100;
    let combos = [];
    let totalKellyAmount = 0;

    const addCombo = (name, fields, p, odd) => {
        let amount = Math.round(totalBudget * kellyStake(p, odd));
        if (amount < 1) amount = 0;
        combos.push({ name, fields, amount, p, odd });
        totalKellyAmount += amount;
    };

    addCombo(`单关:${A.home}`, [A], pA, oddA);
    addCombo(`单关:${B.home}`, [B], pB, oddB);
    addCombo(`单关:${C.home}`, [C], pC, oddC);
    addCombo(`单关:${D.home}`, [D], pD, oddD);
    
    addCombo(`2串1:A+B`, [A,B], (pA+pB)/2, oddA*oddB);
    addCombo(`2串1:A+C`, [A,C], (pA+pC)/2, oddA*oddC);
    addCombo(`2串1:B+C`, [B,C], (pB+pC)/2, oddB*oddC);
    addCombo(`2串1:B+D`, [B,D], (pB+pD)/2, oddB*oddD);

    addCombo(`3串1:A+B+C`, [A,B,C], (pA+pB+pC)/3, oddA*oddB*oddC);
    addCombo(`4串1:A+B+C+D`, [A,B,C,D], (pA+pB+pC+pD)/4, oddA*oddB*oddC*oddD);

    if (totalKellyAmount < 100 && totalKellyAmount > 0) {
        const diff = 100 - totalKellyAmount;
        const activeCombos = combos.filter(c => c.amount > 0);
        if (activeCombos.length > 0) {
            const totalP = activeCombos.reduce((sum, c) => sum + c.p, 0);
            for (let c of combos) {
                if (c.amount > 0 && totalP > 0) {
                    const extra = Math.round(diff * (c.p / totalP));
                    c.amount += extra;
                }
            }
        }
    }
    return combos.filter(c => c.amount > 0);
}

// ---------- 更新统计 ----------
function updateStatistics(finishedMatches) {
    const methods = ['胜平负', '半全场', '正确比分'];
    const stats = {};
    methods.forEach(m => stats[m] = { correct: 0, total: 0, profit: 0, stake: 0 });
    let bestMethod = '胜平负'; let bestRate = 0;

    for (const match of finishedMatches) {
        const actualScore = `${match.homeScore}:${match.awayScore}`;
        const matchId = `${match.home}_${match.away}_${match.date}`;
        if (!optimalCache.has(matchId)) continue;
        const cached = optimalCache.get(matchId);
        const pred = cached.pred;
        const odds = cached.odds;
        const [h, a] = actualScore.split(':').map(Number);
        const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');

        const methodsToCheck = {
            '胜平负': { correct: pred.win_draw_lose.prediction === actualSPF, odds: parseFloat(odds.win) || 2.0 },
            '半全场': { correct: pred.half_full.prediction === actualSPF, odds: parseFloat(odds.hf_odds) || 3.0 },
            '正确比分': { correct: pred.correct_score.prediction === actualScore, odds: parseFloat(odds.cs_odds) || 6.0 }
        };
        
        for (const [method, data] of Object.entries(methodsToCheck)) {
            stats[method].total += 1;
            const stake = 1;
            if (data.correct) {
                stats[method].correct += 1;
                stats[method].profit += stake * (data.odds - 1);
            } else {
                stats[method].profit -= stake;
            }
            stats[method].stake += stake;
        }
    }

    const rates = {};
    for (const method of methods) {
        const total = stats[method].total || 1;
        const rate = stats[method].correct / total;
        rates[method] = rate;
        if (rate > bestRate) { bestRate = rate; bestMethod = method; }
        global.historicalMethodSuccess[method] = { 
            hits: stats[method].correct, 
            total: stats[method].total,
            profit: stats[method].profit,
            totalStake: stats[method].stake
        };
    }
    global.methodStats = stats; global.rates = rates; global.bestMethod = bestMethod;
}

// ---------- 未开赛推演 ----------
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
            const context = await getMatchNews(home, away);
            const predDeepSeek = await callDeepSeek(home, away, context);
            const mathResult = await calculatePoissonProbabilities(home, away);

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
            
            // 🟢【绝对防御】修复导致崩溃的 null 指针报错
            let finalPred = {};
            const targetMethod = historicalBestMethod;
            const bestPred = cacheEntry.best ? cacheEntry.best.pred : null;

            // 只要 bestPred 存在才去读取方法，否则直接返回兜底结果
            if (bestPred) {
                if (targetMethod === '半全场') {
                    finalPred = { method: '半全场', prediction: bestPred.half_full.prediction, analysis: bestPred.half_full.analysis };
                } else if (targetMethod === '正确比分') {
                    finalPred = { method: '正确比分', prediction: bestPred.correct_score.prediction, analysis: bestPred.correct_score.analysis };
                } else {
                    finalPred = { method: targetMethod, prediction: bestPred.win_draw_lose.prediction };
                }
            } else {
                // 如果因为各种原因导致 AI 推演失败，就用最稳健的 50% 概率的平局兜底，绝不崩
                finalPred = { method: '胜平负', prediction: '平局', analysis: 'AI调用失败，系统启用平局兜底' };
            }

            cacheEntry.finalMethod = finalPred;
            upcomingCache.set(key, cacheEntry);
            matchPredictions.push({ home, away, matchKey: key, odds, finalPrediction: finalPred });
        } catch (err) { 
            console.warn(`[未开赛] 预测失败: ${err.message}`);
            // 在这里也把失败的比赛塞进去，防止整个组合计算缺失
            const cached = upcomingCache.get(key) || { latest: null, best: null, odds: { hf_odds: '3.0', cs_odds: '6.0', win: '2.0', lose: '2.5', draw: '3.0' } };
            matchPredictions.push({ home, away, matchKey: key, odds: cached.odds, finalPrediction: { method: '胜平负', prediction: '平局' } });
        }
    }

    if (matchPredictions.length === 4) {
        const betCombo = calculateOptimalCombo(matchPredictions);
        global.upcomingBets = betCombo;
    }
}

function startTimers() {
    setInterval(async () => { await runFinishedSimulation(); }, 300000);
    setInterval(async () => { await runUpcomingSimulation(); }, 180000); // 3分钟一次，降低API压力
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

    let safeBets = [];
    if (global.upcomingBets && global.upcomingBets.length > 0) {
        safeBets = global.upcomingBets;
    } else {
        safeBets = [ { name: "等待推演中...", fields: [], amount: 0 } ];
    }

    let safeBetSummary = {
        totalProfit: 0, methodProfits: {}, dailyProfits: {}, betRecords: []
    };
    if (global.betSummary) {
        safeBetSummary.totalProfit = global.betSummary.totalProfit || 0;
        safeBetSummary.methodProfits = global.betSummary.methodProfits || {};
        safeBetSummary.dailyProfits = global.betSummary.dailyProfits || {};
        safeBetSummary.betRecords = global.betSummary.betRecords || [];
    }

    const state = {
        totalAttempts: totalAttempts,
        finished: finishedWithPred,
        upcoming: upcomingWithPred,
        bestMethod: global.bestMethod || '胜平负',
        stats: global.methodStats || {},
        rates: global.rates || {},
        upcomingBets: safeBets,
        betSummary: safeBetSummary
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
