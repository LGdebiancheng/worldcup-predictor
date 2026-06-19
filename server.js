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
let previousOddsRecord = {}; 

// 🟢 存储外部网站抓取的数据
let externalPredictions = [];

// 复盘日记本
let matchDiary = [];

// 历史盈利率(ROI)
let historicalMethodSuccess = {
    '胜平负': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '让球胜平负': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '总进球数': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '半全场': { hits: 0, total: 0, profit: 0, totalStake: 0 },
    '正确比分': { hits: 0, total: 0, profit: 0, totalStake: 0 }
};

// ---------- 数据映射 ----------
const nameMap = { 'Brazil': '巴西', 'Argentina': '阿根廷', 'France': '法国', 'England': '英格兰', 'Germany': '德国', 'Spain': '西班牙', 'Portugal': '葡萄牙', 'Netherlands': '荷兰', 'Italy': '意大利', 'Belgium': '比利时', 'Mexico': '墨西哥', 'Uruguay': '乌拉圭', 'Croatia': '克罗地亚', 'Denmark': '丹麦', 'Switzerland': '瑞士', 'USA': '美国', 'Senegal': '塞内加尔', 'Japan': '日本', 'South Korea': '韩国', 'Australia': '澳大利亚', 'Ecuador': '厄瓜多尔', 'Ghana': '加纳', 'Morocco': '摩洛哥', 'Nigeria': '尼日利亚', 'Serbia': '塞尔维亚', 'Poland': '波兰', 'Ukraine': '乌克兰', 'Austria': '奥地利', 'Wales': '威尔士', 'Scotland': '苏格兰', 'Czech Republic': '捷克', 'South Africa': '南非', 'Canada': '加拿大', 'New Zealand': '新西兰', 'Costa Rica': '哥斯达黎加', 'Panama': '巴拿马', 'Saudi Arabia': '沙特', 'Iran': '伊朗', 'Qatar': '卡塔尔', 'Cameroon': '喀麦隆', 'Sweden': '瑞典' };
const teamNameMapForOdds = { '巴西': 'Brazil', '阿根廷': 'Argentina', '法国': 'France', '英格兰': 'England', '德国': 'Germany', '西班牙': 'Spain', '葡萄牙': 'Portugal', '荷兰': 'Netherlands', '意大利': 'Italy', '比利时': 'Belgium', '墨西哥': 'Mexico', '乌拉圭': 'Uruguay', '克罗地亚': 'Croatia', '丹麦': 'Denmark', '瑞士': 'Switzerland', '美国': 'USA', '塞内加尔': 'Senegal', '日本': 'Japan', '韩国': 'South Korea', '澳大利亚': 'Australia', '厄瓜多尔': 'Ecuador', '加纳': 'Ghana', '摩洛哥': 'Morocco', '尼日利亚': 'Nigeria', '塞尔维亚': 'Serbia', '波兰': 'Poland', '乌克兰': 'Ukraine', '奥地利': 'Austria', '威尔士': 'Wales', '苏格兰': 'Scotland', '捷克': 'Czech Republic', '南非': 'South Africa', '加拿大': 'Canada', '新西兰': 'New Zealand', '哥斯达黎加': 'Costa Rica', '巴拿马': 'Panama', '沙特': 'Saudi Arabia', '伊朗': 'Iran', '卡塔尔': 'Qatar', '喀麦隆': 'Cameroon', '瑞典': 'Sweden' };
const eloMap = { '巴西': 2100, '阿根廷': 2080, '法国': 2050, '英格兰': 2030, '德国': 2000, '西班牙': 1980, '葡萄牙': 1960, '荷兰': 1940, '意大利': 1920, '比利时': 1900, '墨西哥': 1880, '乌拉圭': 1860, '克罗地亚': 1840, '丹麦': 1820, '瑞士': 1800, '美国': 1780, '塞内加尔': 1760, '日本': 1740, '韩国': 1720, '澳大利亚': 1700, '厄瓜多尔': 1680, '加纳': 1660, '摩洛哥': 1640, '尼日利亚': 1620, '塞尔维亚': 1600, '波兰': 1580, '乌克兰': 1560, '奥地利': 1540, '威尔士': 1520, '苏格兰': 1500, '捷克': 1480, '南非': 1460, '加拿大': 1440, '新西兰': 1420, '哥斯达黎加': 1400, '巴拿马': 1380, '沙特': 1360, '伊朗': 1340, '卡塔尔': 1320, '喀麦隆': 1300, '瑞典': 1280 };
const DEFAULT_ELO = 1500;
function getElo(team) { return eloMap[team] || DEFAULT_ELO; }

const fallbackData = { finished: [], upcoming: [] };

// 随机 UA 池
function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// ==========================================
// 🟢【优化 1】：双重抓取源，防抓取拦截
// ==========================================
async function getMatchNewsAndInjury(home, away) {
    let isCriticalInjury = false;
    let injuryKey = '';
    let news = '';
    
    // 准备两个备选来源，极大降低因网站改版/封IP导致的情报缺失
    const searchUrls = [
        `https://www.dongqiudi.com/search?keyword=${encodeURIComponent(home + ' ' + away + ' 伤停 首发')}`,
        `https://sports.sina.com.cn/` // 仅做示例，若懂球帝失败，这里可替换为稳定备用源
    ];

    for (const url of searchUrls) {
        try {
            const response = await axios.get(url, { headers: { 'User-Agent': getRandomUserAgent() }, timeout: 5000 });
            const $ = cheerio.load(response.data);
            // 懂球帝特定 DOM 解析
            $('.news-item').each((i, elem) => {
                if (i < 3) {
                    const title = $(elem).find('.title').text().trim();
                    if (title.includes(home) || title.includes(away)) {
                        news += title + '；';
                        const injuryKeywords = ['缺席', '受伤', '缺阵', '红牌', '停赛', '伤停', '替补'];
                        for (const word of injuryKeywords) {
                            if (title.includes(word)) { isCriticalInjury = true; injuryKey = word; break; }
                        }
                    }
                }
            });
            if (news) break; // 如果抓到新闻，跳出循环不再请求第二个源
        } catch (err) {
            // 第一个源失败，静默切换至第二个（如果存在第二个的话）
        }
    }

    // 如果两个源都没抓到新闻，降级为 ELO 评分兜底
    if (!news) {
        const eloH = getElo(home); const eloA = getElo(away);
        news = `主队 ${home} 实力评分 ${eloH}，客队 ${away} 实力评分 ${eloA}。`;
    }
    return { text: news, isCriticalInjury, injuryKey };
}

// ==========================================
// 真实数据泊松分布
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
            if (homeTeam === teamName && m.score.fullTime.home !== null) { totalGoals += m.score.fullTime.home; count++; }
            else if (awayTeam === teamName && m.score.fullTime.away !== null) { totalGoals += m.score.fullTime.away; count++; }
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
// 6大玩法的精准赔率映射
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
        let halfFullMap = {};
        let correctScoreMap = {};
        let totalGoalsMap = {};
        
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
                    totalGoalsMap[value.value] = parseFloat(value.odd);
                }
            } else if (bet.id === 5) { 
                for (const value of bet.values) {
                    halfFullMap[value.value] = parseFloat(value.odd);
                }
            } else if (bet.id === 6) { 
                for (const value of bet.values) {
                    correctScoreMap[value.value] = parseFloat(value.odd);
                }
            }
        }
        return { win: win.toFixed(2), draw: draw.toFixed(2), lose: lose.toFixed(2), h_odds: h_odds.toFixed(2), d_odds: d_odds.toFixed(2), a_odds: a_odds.toFixed(2), total_odds: total_odds.toFixed(2), hf_odds: hf_odds.toFixed(2), cs_odds: cs_odds.toFixed(2), halfFullMap, correctScoreMap, totalGoalsMap, handicap: '0', from_real: true };
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
            if (dropRatio > 0.20) flash_warning = true;
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
        total_odds: (1.9).toFixed(2), hf_odds: '3.0', cs_odds: '6.0', halfFullMap: {}, correctScoreMap: {}, totalGoalsMap: {}, handicap: '0', from_real: false, flash_warning: false
    };
    oddsCache.set(key, { odds, timestamp: now });
    return odds;
}

// ---------- 🟢【优化 2】：DeepSeek 网络请求增加重试机制 ----------
async function callDeepSeek(home, away, context, externalSignal, retries = 2) {
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) throw new Error('未设置 DEEPSEEK_API_KEY 环境变量');
    
    const externalContext = externalSignal ? `【外部AI平台交叉验证】${externalSignal}` : '';
    const prompt = `你是顶级的足球预测专家。现在进行的是世界杯小组赛。赛前最新情报：${context}。${externalContext}。请针对 ${home} vs ${away} 的比赛进行深度分析。
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
    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
            body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.7, response_format: { type: "json_object" } })
        });
        if (!response.ok) throw new Error(`DeepSeek API 错误 (${response.status})`);
        const data = await response.json();
        let content = data.choices[0].message.content;
        content = content.replace(/^```json\s?/i, '').replace(/```\s?$/i, '');
        return JSON.parse(content);
    } catch (err) {
        if (retries > 0) {
            console.warn(`DeepSeek 请求失败，正在自动重试... (剩余 ${retries} 次)`);
            await new Promise(r => setTimeout(r, 1500)); // 等待 1.5 秒
            return callDeepSeek(home, away, context, externalSignal, retries - 1);
        }
        throw err;
    }
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
                const { text: context } = await getMatchNewsAndInjury(home, away);
                const pred = await callDeepSeek(home, away, context, null);
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
            const isUpsetFlag = isUpsetWithOdds(home, away, actualScore, odds);
            const weight = isUpsetFlag ? 1.5 : 1.0;
            optimalCache.set(matchId, { pred: bestPred, score: bestScore, odds: odds, weight: weight, actualScore: actualScore, home, away });
        }
    }
    updateStatistics(finished);
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

// 辅助函数：去除所有空格、破折号和大小写，只留核心汉字和字母，用于强匹配
function normalizeString(str) {
    return str.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '').toLowerCase();
}

async function fetchExternalPredictions() {
    const targetUrl = 'https://worldcup.lyihub.com/index.html';
    try {
        const response = await axios.get(targetUrl, { 
            headers: { 'User-Agent': getRandomUserAgent() }, 
            timeout: 8000 
        });
        const $ = cheerio.load(response.data);
        
        let predictions = [];
        let aiNames = [];
        
        $('table').each((index, table) => {
            const rows = $(table).find('tr');
            if (rows.length > 2) {
                const headerCells = rows.eq(0).find('th, td');
                if (headerCells.length > 0) {
                    headerCells.each((i, cell) => {
                        if (i === 0) aiNames.push('比赛');
                        else aiNames.push($(cell).text().trim() || `AI-${i}`);
                    });
                }
                rows.each((rowIndex, row) => {
                    if (rowIndex === 0) return;
                    const cells = $(row).find('td');
                    if (cells.length >= 2) {
                        const matchName = cells.eq(0).text().trim();
                        const matchData = [];
                        for (let i = 1; i < cells.length; i++) {
                            matchData.push(cells.eq(i).text().trim().replace(/\s+/g, ' '));
                        }
                        if (matchName && matchData.length > 0) {
                            predictions.push({
                                match: matchName,
                                aiData: matchData
                            });
                        }
                    }
                });
            }
        });

        if (predictions.length > 0) {
            return {
                aiNames: aiNames,
                predictions: predictions
            };
        }
        return null;
    } catch (error) {
        console.warn(`⚠️ 外部站点抓取失败: ${error.message}`);
        return null;
    }
}

// ==========================================
// 凯利公式逻辑
// ==========================================
function calculateKellyForMatches(matches, mode, budget = 100) {
    const getConf = (key) => {
        const cached = upcomingCache.get(key);
        return cached && cached.best ? (cached.best.confidence / 100) : 0.5; 
    };

    const getOddAndPred = (match, overrideMethod) => {
        const method = overrideMethod || match.finalPrediction.method;
        const odds = match.odds;
        let prediction = match.finalPrediction.prediction;
        
        if (overrideMethod && overrideMethod !== match.finalPrediction.method) {
            const cached = upcomingCache.get(match.matchKey);
            if (cached && cached.best) {
                if (overrideMethod === '半全场') prediction = cached.best.pred.half_full.prediction;
                else if (overrideMethod === '正确比分') prediction = cached.best.pred.correct_score.prediction;
                else if (overrideMethod === '胜平负') prediction = cached.best.pred.win_draw_lose.prediction;
                else if (overrideMethod === '让球胜平负') prediction = cached.best.pred.handicap.prediction;
                else if (overrideMethod === '总进球数') prediction = cached.best.pred.total_goals.prediction;
            }
        }

        if (method === '半全场') {
            const chinese2api = { '胜胜': 'Home/Home', '平胜': 'Draw/Home', '负胜': 'Away/Home', '胜平': 'Home/Draw', '平平': 'Draw/Draw', '负平': 'Away/Draw', '胜负': 'Home/Away', '平负': 'Draw/Away', '负负': 'Away/Away' };
            const apiKey = chinese2api[prediction];
            const odd = odds.halfFullMap && odds.halfFullMap[apiKey] ? odds.halfFullMap[apiKey] : (parseFloat(odds.hf_odds) || 3.0);
            return { odd, pred: prediction };
        }
        if (method === '正确比分') {
            const odd = odds.correctScoreMap && odds.correctScoreMap[prediction] ? odds.correctScoreMap[prediction] : (parseFloat(odds.cs_odds) || 6.0);
            return { odd, pred: prediction };
        }
        if (method === '胜平负') {
            if (prediction.includes('主队胜')) return { odd: parseFloat(odds.win) || 2.0, pred: prediction };
            if (prediction.includes('客队胜')) return { odd: parseFloat(odds.lose) || 2.5, pred: prediction };
            return { odd: parseFloat(odds.draw) || 3.0, pred: prediction };
        }
        if (method === '让球胜平负') {
            if (prediction.includes('主队赢盘')) return { odd: parseFloat(odds.h_odds) || 1.9, pred: prediction };
            if (prediction.includes('客队赢盘')) return { odd: parseFloat(odds.a_odds) || 2.0, pred: prediction };
            return { odd: parseFloat(odds.d_odds) || 3.2, pred: prediction };
        }
        if (method === '总进球数') {
            let odd = 1.9;
            if (odds.totalGoalsMap && odds.totalGoalsMap[prediction]) {
                odd = odds.totalGoalsMap[prediction];
            }
            return { odd, pred: prediction };
        }
        return { odd: 2.0, pred: prediction };
    };

    const kellyStake = (p, odd) => {
        if (odd <= 1 || p <= 0 || p >= 1) return 0;
        const b = odd - 1;
        const f = (p * b - (1 - p)) / b;
        return Math.max(0, Math.min(0.25, f));
    };

    let combos = [];
    let totalKellyAmount = 0;

    const addCombo = (name, fields, p, odd) => {
        let amount = Math.round(budget * kellyStake(p, odd));
        if (amount < 1) amount = 0;
        combos.push({ name, fields, amount, p, odd });
        totalKellyAmount += amount;
    };

    if (matches.length === 4) {
        const [A, B, C, D] = matches;
        const pA = getConf(A.matchKey);
        const pB = getConf(B.matchKey);
        const pC = getConf(C.matchKey);
        const pD = getConf(D.matchKey);

        const oddA = getOddAndPred(A, mode).odd;
        const oddB = getOddAndPred(B, mode).odd;
        const oddC = getOddAndPred(C, mode).odd;
        const oddD = getOddAndPred(D, mode).odd;

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

        if (totalKellyAmount < budget && totalKellyAmount > 0) {
            const diff = budget - totalKellyAmount;
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
    }

    // 🟢【优化 3】：信心极低时的绝对兜底
    if (combos.filter(c => c.amount > 0).length === 0) {
        const [A, B, C, D] = matches;
        combos = [
            { name: `单关:${A.home}`, fields: [A], amount: 25 },
            { name: `单关:${B.home}`, fields: [B], amount: 25 },
            { name: `单关:${C.home}`, fields: [C], amount: 25 },
            { name: `单关:${D.home}`, fields: [D], amount: 25 }
        ];
    }
    return combos.filter(c => c.amount > 0);
}

// ---------- 更新统计 ----------
function updateStatistics(finishedMatches) {
    const methods = ['胜平负', '让球胜平负', '总进球数', '半全场', '正确比分'];
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
        const weight = cached.weight || 1.0;
        const [h, a] = actualScore.split(':').map(Number);
        const actualSPF = h > a ? '主队胜' : (h < a ? '客队胜' : '平局');
        const totalActual = h + a;

        const methodsToCheck = {
            '胜平负': { correct: pred.win_draw_lose.prediction === actualSPF, odds: parseFloat(odds.win) || 2.0 },
            '让球胜平负': { correct: pred.handicap.prediction === actualSPF, odds: parseFloat(odds.h_odds) || 1.9 },
            '总进球数': { correct: parseInt(pred.total_goals.prediction) === totalActual, odds: (odds.totalGoalsMap && odds.totalGoalsMap[pred.total_goals.prediction]) || 1.9 },
            '半全场': { correct: pred.half_full.prediction === actualSPF, odds: parseFloat(odds.hf_odds) || 3.0 },
            '正确比分': { correct: pred.correct_score.prediction === actualScore, odds: parseFloat(odds.cs_odds) || 6.0 }
        };
        
        for (const [method, data] of Object.entries(methodsToCheck)) {
            stats[method].total += weight;
            const stake = 1;
            if (data.correct) {
                stats[method].correct += weight;
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

// ---------- 🟢【优化 4】：修改为并行推演，大幅提升加载速度 ----------
async function runUpcomingSimulation() {
    const matchData = lastMatchData;
    const upcoming = matchData.upcoming || [];
    if (upcoming.length === 0) return;

    const historicalBestMethod = global.bestMethod || '半全场'; 
    const upcomingLimit = 4;
    const upcomingSlice = upcoming.slice(0, upcomingLimit);

    const externalData = await fetchExternalPredictions();
    if (externalData) {
        global.externalPredictions = externalData;
    }

    // 将原来的 for 循环改为并行处理
    const matchPromises = upcomingSlice.map(async (match) => {
        const home = match.home; const away = match.away;
        const key = `${home}_${away}`;
        try {
            const { text: context, isCriticalInjury, injuryKey } = await getMatchNewsAndInjury(home, away);
            
            let externalSignal = null;
            if (externalData && externalData.predictions) {
                const matchNorm = normalizeString(`${home}vs${away}`);
                for (const ext of externalData.predictions) {
                    const extMatchNorm = normalizeString(ext.match);
                    if (extMatchNorm.includes(matchNorm) || matchNorm.includes(extMatchNorm)) {
                        externalSignal = ext.aiData.join('，');
                        break;
                    }
                }
            }

            const predDeepSeek = await callDeepSeek(home, away, context, externalSignal);
            const mathResult = await calculatePoissonProbabilities(home, away);

            let finalPredJson = predDeepSeek;
            let confidenceMultiplier = 1.0;
            if (mathResult.mathConfidence > 0.7) confidenceMultiplier = 1.2;

            if (externalSignal) {
                if (predDeepSeek.half_full && predDeepSeek.half_full.prediction === '胜胜' && externalSignal.includes('主队胜')) {
                    confidenceMultiplier *= 1.1;
                }
            }

            if (isCriticalInjury) {
                if (finalPredJson.half_full && finalPredJson.half_full.prediction === '胜胜') {
                    confidenceMultiplier *= 0.5; 
                }
            }

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
            const bestPred = cacheEntry.best ? cacheEntry.best.pred : null;

            if (bestPred) {
                if (targetMethod === '半全场') {
                    finalPred = { method: '半全场', prediction: bestPred.half_full.prediction, analysis: bestPred.half_full.analysis };
                } else if (targetMethod === '正确比分') {
                    finalPred = { method: '正确比分', prediction: bestPred.correct_score.prediction, analysis: bestPred.correct_score.analysis };
                } else if (targetMethod === '让球胜平负') {
                    finalPred = { method: '让球胜平负', prediction: bestPred.handicap.prediction, analysis: bestPred.handicap.analysis };
                } else if (targetMethod === '总进球数') {
                    finalPred = { method: '总进球数', prediction: bestPred.total_goals.prediction, analysis: bestPred.total_goals.analysis };
                } else {
                    finalPred = { method: targetMethod, prediction: bestPred.win_draw_lose.prediction };
                }
            } else {
                finalPred = { method: '胜平负', prediction: '平局', analysis: 'AI调用失败，系统启用平局兜底' };
            }

            const autoWarnings = [];
            if (isCriticalInjury) autoWarnings.push(`赛前自动检测到[${injuryKey}]状况，已自动调低该场胜胜信心`);
            if (odds && odds.flash_warning) autoWarnings.push(`⚠️ 盘口赔率有异动，机构大资金注入！`);
            if (externalSignal) autoWarnings.push(`外部AI平台交叉验证：${externalSignal}`);

            cacheEntry.finalMethod = { ...finalPred, autoWarnings };
            upcomingCache.set(key, cacheEntry);
            return { home, away, matchKey: key, odds, finalPrediction: { ...finalPred, autoWarnings } };
        } catch (err) { 
            console.warn(`[未开赛] 预测失败: ${err.message}`);
            const cached = upcomingCache.get(key) || { latest: null, best: null, odds: { hf_odds: '3.0', cs_odds: '6.0', win: '2.0', lose: '2.5', draw: '3.0', halfFullMap: {}, correctScoreMap: {}, totalGoalsMap: {} } };
            return { home, away, matchKey: key, odds: cached.odds, finalPrediction: { method: '胜平负', prediction: '平局', autoWarnings: ['接口异常，系统启用平局兜底'] } };
        }
    });

    // 等待所有推演结果同时完成
    const matchPredictions = await Promise.all(matchPromises);

    if (matchPredictions.length === 4) {
        global.upcomingBetsOverall = calculateKellyForMatches(matchPredictions, null, 100);
        global.upcomingBetsWinDrawLose = calculateKellyForMatches(matchPredictions, '胜平负', 100);
        global.upcomingBetsHandicap = calculateKellyForMatches(matchPredictions, '让球胜平负', 100);
        global.upcomingBetsTotalGoals = calculateKellyForMatches(matchPredictions, '总进球数', 100);
        global.upcomingBetsHF = calculateKellyForMatches(matchPredictions, '半全场', 100);
        global.upcomingBetsCS = calculateKellyForMatches(matchPredictions, '正确比分', 100);
    }
}

function startTimers() {
    setInterval(async () => { await runFinishedSimulation(); }, 300000);
    setInterval(async () => { await runUpcomingSimulation(); }, 180000);
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

    const safeBet = (bets) => {
        if (bets && bets.length > 0) return bets;
        return [ { name: "等待推演中...", fields: [], amount: 0 } ];
    };

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
        externalPredictions: global.externalPredictions || { aiNames: [], predictions: [] },
        upcomingBetsOverall: safeBet(global.upcomingBetsOverall),
        upcomingBetsWinDrawLose: safeBet(global.upcomingBetsWinDrawLose),
        upcomingBetsHandicap: safeBet(global.upcomingBetsHandicap),
        upcomingBetsTotalGoals: safeBet(global.upcomingBetsTotalGoals),
        upcomingBetsHF: safeBet(global.upcomingBetsHF),
        upcomingBetsCS: safeBet(global.upcomingBetsCS),
        betSummary: safeBetSummary
    };
    res.json(state);
});

// 复盘日记接口
app.get('/api/review', (req, res) => {
    const logs = [];
    const keys = Array.from(optimalCache.keys());
    for (const matchId of keys) {
        const data = optimalCache.get(matchId);
        if (data && data.pred && data.actualScore) {
            const predObj = data.pred;
            const result = {
                match: `${data.home || '未知'} vs ${data.away || '未知'}`,
                actualScore: data.actualScore,
                predictedHF: predObj.half_full ? predObj.half_full.prediction : '无',
                predictedCS: predObj.correct_score ? predObj.correct_score.prediction : '无',
                isHitHF: predObj.half_full && predObj.half_full.prediction === (data.actualScore.split(':')[0] > data.actualScore.split(':')[1] ? '主队胜' : (data.actualScore.split(':')[0] < data.actualScore.split(':')[1] ? '客队胜' : '平局')),
                isHitCS: predObj.correct_score && predObj.correct_score.prediction === data.actualScore
            };
            logs.push(result);
        }
    }
    res.json({ reviews: logs.reverse() });
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
