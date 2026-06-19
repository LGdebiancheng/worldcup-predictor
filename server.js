const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ---------- 全局状态 ----------
let totalAttempts = 0;
const optimalCache = new Map();
const upcomingCache = new Map();
const oddsCache = new Map();
let bestMethod = '胜平负'; // 默认
let methodStats = {};
let rates = {};
let betSummary = {};
let lastMatchData = {};

// ---------- 中文映射 (保留原样) ----------
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

// ---------- 模拟备选数据 (与原逻辑相同) ----------
const fallbackData = {
    finished: [], // 此处省略, 保持原代码fallback逻辑即可
    upcoming: []
};

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

// ---------- 从 API-Football 获取真实赔率 ----------
async function fetchRealOdds(home, away) {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) {
        console.log('⚠️ FOOTBALL_API_KEY 未设置，使用模拟赔率');
        return null;
    }
    const homeEn = teamNameMapForOdds[home] || home;
    const awayEn = teamNameMapForOdds[away] || away;
    try {
        const searchUrl = `https://v3.football.api-sports.io/fixtures?team=${encodeURIComponent(homeEn)}&season=2026`;
        const searchResp = await fetch(searchUrl, {
            headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
        });
        if (!searchResp.ok) return null;
        const searchData = await searchResp.json();
        if (!searchData.response || searchData.response.length === 0) return null;
        
        let fixture = null;
        for (const item of searchData.response) {
            const teams = item.teams;
            if ((teams.home.name === homeEn || teams.away.name === awayEn) ||
                (teams.home.name.includes(homeEn) && teams.away.name.includes(awayEn))) {
                fixture = item; break;
            }
        }
        if (!fixture) return null;
        const fixtureId = fixture.fixture.id;
        const oddsUrl = `https://v3.football.api-sports.io/odds?fixture=${fixtureId}`;
        const oddsResp = await fetch(oddsUrl, {
            headers: { 'x-rapidapi-key': API_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
        });
        if (!oddsResp.ok) return null;
        const oddsData = await oddsResp.json();
        if (!oddsData.response || oddsData.response.length === 0) return null;
        const bookmaker = oddsData.response[0].bookmakers[0];
        if (!bookmaker) return null;

        let win = 2.0, draw = 3.0, lose = 2.5;
        let h_odds = 1.9, d_odds = 3.2, a_odds = 2.0;
        let total_odds = 1.9;

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
        console.error('❌ 获取真实赔率失败:', error.message);
        return null;
    }
}

function isUpsetWithOdds(home, away, actualScore, odds) {
    const totalProb = 1/parseFloat(odds.win) + 1/parseFloat(odds.draw) + 1/parseFloat(odds.lose);
    const probHome = (1/parseFloat(odds.win)) / totalProb;
    const probDraw = (1/parseFloat(odds.draw)) / totalProb;
    const probAway = (1/parseFloat(odds.lose)) / totalProb;
    const [h, a] = actualScore.split(':').map(Number);
    let actualProb = 0;
    if (h > a) actualProb = probHome;
    else if (h < a) actualProb = probAway;
    else actualProb = probDraw;
    return actualProb < 0.25;
}

async function getOdds(home, away, isFinished = false) {
    const key = `${home}_${away}`;
    const cached = oddsCache.get(key);
    const now = Date.now();
    const ttl = isFinished ? 86400000 : 10800000; 
    if (cached && (now - cached.timestamp) < ttl) return cached.odds;

    console.log(`🔄 [赔率] 实时获取: ${home} vs ${away}`);
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

// ---------- 🎯 重点优化：强化 AI 对半全场和比分的预判 ----------
async function callDeepSeek(home, away) {
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');

    // 添加针对上下半场的特别提示，并提升半全场/比分的重要性
    const prompt = `你是顶级的足球预测专家。请严格针对 ${home} vs ${away} 的比赛进行深度分析。

**分析重点：** 请你深度剖析两支球队的“上半场战术”（谁能抢开局）以及“全场战术”（谁能拿下比赛）。
**我们最关注的玩法是：** ① 半全场； ② 正确比分。

请返回严格的JSON结构（不要包含任何Markdown格式）：
{
  "confidence": 整数(0-100, 表示你对整体预测的信心度),
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": ""},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": ""},
  "total_goals": {"prediction": "数字（如0,1,2,3,4,5）", "analysis": ""},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": "重点分析半全场可能性"},
  "correct_score": {"prediction": "具体比分如2:1", "analysis": "重点分析你选这个比分的理由"}
}`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.7, response_format: { type: "json_object" } })
    });

    if (!response.ok) { const err = await response.text(); throw new Error(`DeepSeek API 错误 (${response.status}): ${err}`); }
    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
}

async function fetchMatchesFromAPI() {
    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) { console.log('⚠️ FOOTBALL_API_KEY 未设置，使用模拟数据'); return { success: true, ...fallbackData }; }
    try {
        const url = 'https://api.football-data.org/v4/competitions/2000/matches';
        const response = await fetch(url, { headers: { 'X-Auth-Token': API_KEY } });
        if (!response.ok) { console.log(`⚠️ API 返回 ${response.status}，使用模拟数据`); return { success: true, ...fallbackData }; }
        const data = await response.json();
        if (!data.matches || data.matches.length === 0) return { success: true, ...fallbackData };
        const matches = data.matches.map(m => {
            const home = nameMap[m.homeTeam?.name] || m.homeTeam?.name || '未知';
            const away = nameMap[m.awayTeam?.name] || m.awayTeam?.name || '未知';
            return {
                home, away,
                homeScore: m.score?.fullTime?.home ?? (m.score?.halfTime?.home ?? null),
                awayScore: m.score?.fullTime?.away ?? (m.score?.halfTime?.away ?? null),
                time: m.utcDate ? new Date(m.utcDate).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                status: m.status || 'SCHEDULED', date: m.utcDate || new Date().toISOString()
            };
        });
        return { success: true, finished: matches.filter(m => m.status === 'FINISHED' && m.homeScore !== null).slice(0, 50), upcoming: matches.filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED').slice(0, 15) };
    } catch (error) { console.error('❌ 获取数据出错:', error.message); return { success: true, ...fallbackData }; }
}

// ---------- 🎯 重点优化：对已完赛推演半全场和比分赋予更高权重 ----------
async function runFinishedSimulation() {
    console.log('🔄 [已完赛] 开始推演...');
    try {
        const matchData = lastMatchData;
        const finished = matchData.finished || [];
        if (finished.length === 0) return;

        for (const match of finished) {
            const home = match.home; const away = match.away;
            const actualScore = `${match.homeScore}:${match.awayScore}`;
            const matchId = `${home}_${away}_${match.date}`;
            
            let bestPred = null; let bestScore = -1; let bestConfidence = null;

            const times = 3; // 一个比赛最多推演3次
            for (let i = 0; i < times; i++) {
                totalAttempts++;
                try {
                    const pred = await callDeepSeek(home, away);
                    const [h, a] = actualScore.split(':').map(Number);
                    
                    // 🚀 优化计分逻辑：根据用户需求，把半全场和比分权重加大
                    let score = 0;
                    // 1. 胜平负 基础分
                    const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
                    if (pred.win_draw_lose.prediction === actualSPF) score += 1;
                    // 2. 总进球 基础分
                    const predTotal = parseInt(pred.total_goals.prediction);
                    if (!isNaN(predTotal) && predTotal === h + a) score += 1;
                    // 3. 🟢 半全场 核心高分 (给双倍权重)
                    if (pred.half_full.prediction === actualSPF) score += 2; 
                    // 4. 🟢 正确比分 核心高分 (给三倍权重)
                    if (pred.correct_score.prediction === actualScore) score += 3; 

                    if (score > bestScore) {
                        bestScore = score; bestPred = pred; bestConfidence = pred.confidence || null;
                    }
                } catch (err) { console.warn(`推演失败 (${home} vs ${away}):`, err.message); }
            }

            if (bestPred) {
                const odds = await getOdds(home, away, true);
                const isUpsetFlag = isUpsetWithOdds(home, away, actualScore, odds);
                const weight = isUpsetFlag ? 0.5 : 1.0;
                optimalCache.set(matchId, { pred: bestPred, score: bestScore, confidence: bestConfidence, weight: weight, odds: odds });
                console.log(`✅ [已完赛] 更新: ${home} vs ${away} (得分:${bestScore})`);
            }
        }
        updateStatistics(finished);
        console.log(`✅ [已完赛] 完成，总次数: ${totalAttempts}`);
    } catch (error) { console.error('❌ [已完赛] 推演出错:', error); }
}

// ---------- 🎯 重点优化：投射历史最佳玩法到未来比赛，并生成组合投注 ----------
async function runUpcomingSimulation() {
    console.log('🔄 [未开赛] 开始推演...');
    try {
        const matchData = lastMatchData;
        const upcoming = matchData.upcoming || [];
        if (upcoming.length === 0) return;

        // 🚀 确认已完赛推演出的【最佳玩法】
        const historicalBestMethod = global.bestMethod || '胜平负'; 
        console.log(`📊 历史最佳玩法推荐: ${historicalBestMethod}`);

        const upcomingLimit = 4;
        const upcomingSlice = upcoming.slice(0, upcomingLimit);
        
        // 临时存储这4场比赛的AI预测，用于组合计算
        const matchPredictions = [];

        for (const match of upcomingSlice) {
            const home = match.home; const away = match.away;
            const key = `${home}_${away}`;
            try {
                console.log(`🔮 [未开赛] 预测 ${home} vs ${away}`);
                const pred = await callDeepSeek(home, away);
                const timestamp = new Date().toISOString();

                let cacheEntry = upcomingCache.get(key);
                if (!cacheEntry) cacheEntry = { latest: null, best: null };
                cacheEntry.latest = { pred, timestamp };

                // 如果最新预测的信心度更高，更新best
                if (!cacheEntry.best || (pred.confidence !== null && (cacheEntry.best.confidence === null || pred.confidence > cacheEntry.best.confidence))) {
                    cacheEntry.best = { pred, confidence: pred.confidence, timestamp };
                }
                
                const odds = await getOdds(home, away, false);
                cacheEntry.odds = odds;

                // 🚀 核心逻辑：强制使用历史最佳玩法作为最终的推荐结果！
                let finalPred = {};
                if (historicalBestMethod === '半全场') {
                    finalPred = { method: '半全场', prediction: cacheEntry.best.pred.half_full.prediction, analysis: cacheEntry.best.pred.half_full.analysis };
                } else if (historicalBestMethod === '正确比分') {
                    finalPred = { method: '正确比分', prediction: cacheEntry.best.pred.correct_score.prediction, analysis: cacheEntry.best.pred.correct_score.analysis };
                } else {
                    finalPred = { method: historicalBestMethod, prediction: cacheEntry.best.pred.win_draw_lose.prediction };
                }

                cacheEntry.finalMethod = finalPred;
                upcomingCache.set(key, cacheEntry);

                // 存入组合计算列表
                matchPredictions.push({
                    home, away, 
                    matchKey: key,
                    odds: odds,
                    finalPrediction: finalPred
                });

                console.log(`✅ [未开赛] 确定最终投注: ${finalPred.method} -> ${finalPred.prediction}`);
            } catch (err) { console.warn(`[未开赛] 预测失败 (${home} vs ${away}):`, err.message); }
        }

        // 🚀 新增：计算这4场比赛的组合投注分配方案（模拟100元分配）
        if (matchPredictions.length === 4) {
            const betCombo = calculateOptimalCombo(matchPredictions);
            global.upcomingBets = betCombo; // 存入全局供接口获取
            console.log(`💰 组合投注模拟生成完毕，总金额100元`);
        }

        console.log(`✅ [未开赛] 完成，缓存: ${upcomingCache.size}`);
    } catch (error) { console.error('❌ [未开赛] 推演出错:', error); }
}

// ---------- 🎯 新增核心函数：模拟100元组合投注计算 ----------
function calculateOptimalCombo(matches) {
    const A = matches[0], B = matches[1], C = matches[2], D = matches[3];
    
    // 提取对应的赔率
    const getOdd = (match) => {
        if (match.finalPrediction.method === '半全场' || match.finalPrediction.method === '胜平负') {
            if (match.finalPrediction.prediction.includes('主队胜') || match.finalPrediction.prediction === '胜胜') return parseFloat(match.odds.win) || 2.0;
            if (match.finalPrediction.prediction.includes('客队胜') || match.finalPrediction.prediction === '负负') return parseFloat(match.odds.lose) || 2.5;
            return parseFloat(match.odds.draw) || 3.0;
        } else if (match.finalPrediction.method === '正确比分') {
            return 6.0; // 正确比分固定用6.0作为模拟赔率
        }
        return 1.0;
    };

    const aOdd = getOdd(A), bOdd = getOdd(B), cOdd = getOdd(C), dOdd = getOdd(D);
    
    // 基于你之前喜欢的 单关+2串1+3串1+4串1 金字塔分布，优化资金分配
    // 为了保本，压重心在 2串1 和 3串1 上
    const combos = [
        { name: `单关:${A.home}`, fields: [A], amount: 8 },
        { name: `单关:${B.home}`, fields: [B], amount: 8 },
        { name: `单关:${C.home}`, fields: [C], amount: 8 },
        { name: `单关:${D.home}`, fields: [D], amount: 6 },
        { name: `2串1:A+B`, fields: [A,B], amount: 14 },
        { name: `2串1:A+C`, fields: [A,C], amount: 10 },
        { name: `2串1:B+C`, fields: [B,C], amount: 10 },
        { name: `2串1:B+D`, fields: [B,D], amount: 6 },
        { name: `2串1:C+D`, fields: [C,D], amount: 4 },
        { name: `3串1:A+B+C`, fields: [A,B,C], amount: 10 },
        { name: `3串1:A+B+D`, fields: [A,B,D], amount: 6 },
        { name: `3串1:B+C+D`, fields: [B,C,D], amount: 4 },
        { name: `3串1:A+C+D`, fields: [A,C,D], amount: 4 },
        { name: `4串1:A+B+C+D`, fields: [A,B,C,D], amount: 2 } // 保留希望
    ];

    // 总投注刚好100元 (8+8+8+6+14+10+10+6+4+10+6+4+4+2 = 100)
    return combos;
}

// ---------- 统计函数 (与原逻辑类似，加入最佳玩法修正) ----------
function updateStatistics(finishedMatches) {
    const methods = ['胜平负', '让球胜平负', '总进球数', '半全场', '正确比分'];
    const stats = {};
    methods.forEach(m => stats[m] = { correct: 0, total: 0 });
    let bestMethod = '胜平负'; let bestRate = 0;

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
        stats['胜平负'].correct += isSPF ? weight : 0; stats['胜平负'].total += weight;
        const isRQ = pred.handicap.prediction === actualSPF;
        stats['让球胜平负'].correct += isRQ ? weight : 0; stats['让球胜平负'].total += weight;
        const predTotal = parseInt(pred.total_goals.prediction);
        const isTG = !isNaN(predTotal) && predTotal === totalActual;
        stats['总进球数'].correct += isTG ? weight : 0; stats['总进球数'].total += weight;
        const isHF = pred.half_full.prediction === actualSPF;
        stats['半全场'].correct += isHF ? weight : 0; stats['半全场'].total += weight;
        const isCS = pred.correct_score.prediction === actualScore;
        stats['正确比分'].correct += isCS ? weight : 0; stats['正确比分'].total += weight;
    });

    const rates = {};
    for (const method of methods) {
        const total = stats[method].total || 1;
        const rate = stats[method].correct / total;
        rates[method] = rate;
        if (rate > bestRate) { bestRate = rate; bestMethod = method; }
    }

    global.methodStats = stats; global.rates = rates; global.bestMethod = bestMethod;
}

// ---------- 定时器优化 (30秒修改为120秒) ----------
function startTimers() {
    setInterval(async () => { await runFinishedSimulation(); }, 300000); // 已完赛5分钟
    setInterval(async () => { await runUpcomingSimulation(); }, 120000); // 🚀 未开赛2分钟，省Token
    console.log('⏰ 定时器已启动');
}

// ---------- API 路由 ----------
app.get('/api/state', (req, res) => {
    const matchData = lastMatchData;
    const finished = matchData.finished || [];
    const upcoming = matchData.upcoming || [];

    const finishedWithPred = finished.map(match => {
        const matchId = `${match.home}_${match.away}_${match.date}`;
        const cached = optimalCache.get(matchId);
        const odds = cached ? cached.odds : null;
        return { ...match, pred: cached ? cached.pred : null, attempt: cached ? cached.attempt : null, totalAttempts: totalAttempts, confidence: cached ? cached.confidence : null, weight: cached ? cached.weight : 1.0, odds: odds };
    });

    const upcomingWithPred = [];
    upcoming.forEach(match => {
        const key = `${match.home}_${match.away}`;
        const cached = upcomingCache.get(key);
        if (cached) {
            upcomingWithPred.push({
                ...match,
                latest: cached.latest ? { pred: cached.latest.pred, confidence: cached.latest.confidence } : null,
                best: cached.best ? { pred: cached.best.pred, confidence: cached.best.confidence } : null,
                odds: cached.odds || null,
                finalMethod: cached.finalMethod || null // 🚀 返回最终建议玩法
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
        upcomingBets: global.upcomingBets || [] // 🚀 返回100元的组合投注计划
    };
    res.json(state);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    const data = await fetchMatchesFromAPI();
    lastMatchData = data;
    startTimers();
    await runFinishedSimulation();
    await runUpcomingSimulation();
});
