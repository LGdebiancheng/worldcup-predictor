// 这里必须换成你 Railway 生成的公网域名
const API_BASE_URL = 'https://worldcup-predictor.up.railway.app';

async function loadPredictions() {
    const container = document.getElementById('today-prediction');
    try {
        const response = await fetch(`${API_BASE_URL}/predict`);
        if (!response.ok) throw new Error(`网络连接错误 (${response.status})`);
        const json = await response.json();

        if (json.status === 'loading') {
            container.innerHTML = `<div class="loading">⏳ 云端正在请求 5 个大模型，请稍候（约 10~20秒）...</div>`;
            return;
        }

        if (json.status === 'ready' && json.data && json.data.matches) {
            const matches = json.data.matches;
            let htmlContent = '';
            matches.forEach(match => {
                let predictionsHtml = '';
                for (const [model, result] of Object.entries(match.predictions)) {
                    let displayResult = result;
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
        container.innerHTML = `<div class="error"><b>⚠️ 连接云端后端失败</b><br>请确保 Railway 处于绿色的 <b>Active/Online</b> 状态。</div>`;
    }
}
window.onload = loadPredictions;
