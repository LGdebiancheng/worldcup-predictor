const API_BASE = 'http://127.0.0.1:8000';

// ==================== 加载状态 ====================
let isLoading = false;
let retryCount = 0;
const MAX_RETRIES = 30; // 最多重试30次
const RETRY_INTERVAL = 2000; // 每2秒重试一次

// ==================== 1. 加载预测数据（带重试） ====================
async function loadPredictions() {
    const resultsDiv = document.getElementById('results');
    const updateInfo = document.getElementById('updateInfo');

    try {
        const response = await fetch(`${API_BASE}/predict`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // 如果还在加载中，显示进度并继续重试
        if (data.status === 'loading') {
            const progress = data.progress || 0;
            updateInfo.innerHTML = `⏳ AI 正在思考中... ${progress}%`;
            resultsDiv.innerHTML = `
                <div style="text-align:center;padding:40px 0;color:#aaa;">
                    <div class="loading" style="display:inline-block;"></div>
                    <p style="margin-top:16px;">AI 正在预测比分，请稍候...</p>
                    <p style="font-size:0.8rem;color:#666;">进度：${progress}%</p>
                </div>
            `;
            
            // 如果还没准备好，继续重试
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(() => loadPredictions(), RETRY_INTERVAL);
            } else {
                updateInfo.innerHTML = '⏰ 加载超时，请刷新页面';
            }
            return;
        }

        // 数据准备好了
        if (data.data && data.data.matches) {
            renderPredictions(data.data, resultsDiv);
            const updateTime = data.last_update ? new Date(data.last_update).toLocaleString('zh-CN') : '未知';
            updateInfo.innerHTML = `🔄 最后更新：<span class="updated">${updateTime}</span> · 每 5 分钟自动刷新`;
            retryCount = 0; // 重置重试计数
        } else {
            resultsDiv.innerHTML = '<p style="text-align:center;color:#888;">暂无数据</p>';
        }

    } catch (error) {
        updateInfo.innerHTML = '❌ 无法连接到后端';
        resultsDiv.innerHTML = `
            <div style="text-align:center;padding:40px 0;color:#ff6b6b;">
                <p>⚠️ 无法连接到后端服务</p>
                <p style="font-size:0.9rem;margin-top:10px;color:#888;">
                    请确保后端已启动：<br />
                    <code style="background:#1a1a2e;padding:4px 12px;border-radius:4px;display:inline-block;margin-top:6px;">
                        cd backend && py -m uvicorn app:app --reload
                    </code>
                </p>
            </div>
        `;
    }
}

function renderPredictions(data, container) {
    if (!data.matches || data.matches.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;">暂无比赛数据</p>';
        return;
    }

    let html = '';
    data.matches.forEach((match) => {
        html += `<div class="match-card">`;
        html += `<div class="match-title">🏟️ ${match.match}</div>`;

        const sortedNames = Object.keys(match.predictions).sort();
        html += `<div class="predictions-grid">`;
        sortedNames.forEach((name) => {
            const score = match.predictions[name];
            const isError = score.startsWith('Error:') || score.startsWith('请求太频繁');
            const scoreClass = isError ? 'error' : 'success';
            html += `<div class="ai-card">`;
            html += `<div class="ai-name">${name}</div>`;
            html += `<div class="ai-score ${scoreClass}">${isError ? '❌' : ''} ${score}</div>`;
            html += `</div>`;
        });
        html += `</div>`;

        if (match.consensus) {
            html += `<div class="consensus-box">
                <span class="label">🤝 综合预测（多数投票）</span>
                <span class="score">${match.consensus}</span>
            </div>`;
        }

        html += `</div>`;
    });

    // 全局综合预测
    if (data.global_consensus && data.global_consensus !== "暂无") {
        html = `
            <div class="global-consensus">
                <span class="label">🏆 今日全局综合预测</span>
                <span class="score">${data.global_consensus}</span>
            </div>
        ` + html;
    }

    container.innerHTML = html;
}

// ==================== 2. 加载历史记录 ====================
async function loadHistory() {
    const container = document.getElementById('historyResults');

    try {
        const response = await fetch(`${API_BASE}/history`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!data.history || data.history.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;">暂无历史记录</p>';
            return;
        }

        let html = `
            <div style="overflow-x:auto;">
            <table class="history-table">
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>比赛</th>
                        <th>实际比分</th>
                        ${Object.keys(data.history[0].predictions).sort().map(name => `<th>${name}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        data.history.slice(0, 10).forEach(record => {
            const time = new Date(record.created_at).toLocaleString('zh-CN');
            const actual = record.actual_score || '⏳ 待赛';
            const isPending = !record.actual_score;
            
            html += `<tr>
                <td style="font-size:0.75rem;color:#888;">${time}</td>
                <td><strong>${record.match}</strong></td>
                <td class="${isPending ? 'pending' : 'correct'}">${actual}</td>`;
            
            const sortedNames = Object.keys(record.predictions).sort();
            sortedNames.forEach(name => {
                const pred = record.predictions[name];
                const isError = pred.startsWith('Error:');
                let status = pred;
                if (!isPending && !isError && pred === actual) {
                    status = `✅ ${pred}`;
                } else if (!isPending && !isError && pred !== actual) {
                    status = `❌ ${pred}`;
                } else if (isError) {
                    status = `⚠️ ${pred}`;
                }
                html += `<td style="font-size:0.8rem;">${status}</td>`;
            });
            
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p style="text-align:center;color:#888;">暂无历史数据</p>`;
    }
}

// ==================== 3. 加载排行榜 ====================
async function loadRankings() {
    const container = document.getElementById('rankingsResults');

    try {
        const response = await fetch(`${API_BASE}/rankings`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (!data.rankings || data.rankings.length === 0) {
            container.innerHTML = `<p style="text-align:center;color:#888;">${data.message || '暂无已完赛的比赛数据'}</p>`;
            return;
        }

        let html = `
            <p style="color:#aaa;margin-bottom:10px;">📊 基于 ${data.total_matches} 场已完赛比赛统计</p>
            <table class="rankings-table">
                <thead>
                    <tr>
                        <th>排名</th>
                        <th>AI 模型</th>
                        <th>命中</th>
                        <th>总场次</th>
                        <th>准确率</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.rankings.forEach((item, index) => {
            const rankClass = index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : '';
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
            const barWidth = item.accuracy;

            html += `<tr>
                <td class="${rankClass}">${medal}</td>
                <td><strong>${item.model}</strong></td>
                <td>${item.correct}</td>
                <td>${item.total}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="flex:1;max-width:120px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
                            <div class="accuracy-bar" style="width:${barWidth}%;"></div>
                        </div>
                        <span style="font-weight:700;color:#fff;">${item.accuracy}%</span>
                    </div>
                </td>
            </tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

    } catch (error) {
        container.innerHTML = `<p style="text-align:center;color:#888;">暂无排行榜数据</p>`;
    }
}

// ==================== 4. 页面自动加载 ====================
async function refreshAll() {
    if (isLoading) return;
    isLoading = true;
    
    try {
        // 并行加载所有数据
        await Promise.all([
            loadPredictions(),
            loadHistory(),
            loadRankings()
        ]);
    } finally {
        isLoading = false;
    }
}

// 页面加载时自动加载
document.addEventListener('DOMContentLoaded', function() {
    refreshAll();
    
    // 每 30 秒刷新一次
    setInterval(refreshAll, 30000);
});