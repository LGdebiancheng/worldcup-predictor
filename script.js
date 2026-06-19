// 【已经匹配到你 Railway 上的域名】
const API_BASE_URL = 'https://worldcup-predictor-production-f064.up.railway.app';

async function loadPredictions() {
    const container = document.getElementById('today-prediction');
    try {
        // 发起真实请求
        const response = await fetch(`${API_BASE_URL}/predict`);
        if (!response.ok) throw new Error(`网络连接错误 (${response.status})`);
        const json = await response.json();

        if (json.status === 'loading') {
            container.innerHTML = `<div class="loading">⏳ 云端正在并发请求 5 个大模型，请稍候（约 10~20秒）...</div>`;
            return;
        }

        if (json.status === 'ready' && json.data && json.data.matches) {
            const matches = json.data.matches;
            let htmlContent = '';
            matches.forEach(match => {
                let predictionsHtml = '';
                for (const [model, result] of Object.entries(match.predictions)) {
                    let displayResult = result;
                    // 自动处理部分平台报错（如429请求超限）
                    if (displayResult.includes('429 Too Many Requests')) {
                        displayResult = '<span class="fail-text">🚫 请求超限 (429)</span>';
                    } else if (displayResult.includes('Error:')) {
                        displayResult = '<span class="fail-text">⚠️ 调用失败</span>';
                    }
                    predictionsHtml += `<span class="badge">${model}</span> ${displayResult}<br>`;
                }
                htmlContent += `
                    <div class="result-item">
                        <div style="font-size:16px; font-weight:bold; margin-bottom:4px;">⚔️ ${match.match}</div>
                        <div class="consensus">AI 多数共识: ${match.consensus}</div>
                        <div style="margin-top:6px; font-size:14px; color:#444;">
                            ${predictionsHtml}
                        </div>
                    </div>
                `;
            });
            container.innerHTML = htmlContent || '<div class="loading">暂无比赛数据</div>';
        } else {
            container.innerHTML = '<div class="loading">后端数据异常，请检查控制台</div>';
        }
    } catch (error) {
        console.error("前端请求失败:", error);
        container.innerHTML = `<div class="error"><b>⚠️ 连接云端后端失败</b><br>请检查 Railway 控制台是否处于绿色的 <b>Active</b> 状态。</div>`;
    }
}
// 页面一加载就执行
window.onload = loadPredictions;
