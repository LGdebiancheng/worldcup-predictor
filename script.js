// 已绑定你的正确云端域名
const API_BASE_URL = 'https://worldcup-predictor-production-f064.up.railway.app';

async function loadPredictions() {
    const container = document.getElementById('today-prediction');
    try {
        console.log(`正在尝试请求: ${API_BASE_URL}/predict`);
        const response = await fetch(`${API_BASE_URL}/predict`);
        if (!response.ok) throw new Error(`网络连接错误 (${response.status})`);
        const json = await response.json();

        // 如果后端提示还在加载中，显示等待字样
        if (json.status === 'loading') {
            container.innerHTML = `<div class="loading">⏳ 云端正在并发请求 5 个大模型，预计需要 15~30秒，请勿刷新...</div>`;
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
            container.innerHTML = '<div class="loading">后端数据异常，请在浏览器按 F12 查看控制台。</div>';
        }
    } catch (error) {
        console.error("前端请求失败:", error);
        // 报错时提示更具体的排查方法
        container.innerHTML = `<div class="error"><b>⚠️ 连接云端后端失败</b><br>
            请先尝试直接访问后端接口看是否有数据：<br>
            <b style="background:#eee;padding:2px 6px;">${API_BASE_URL}/predict</b><br>
            如果提示 500 错误，说明你在 Railway 的 <b>Variables</b> 里可能漏填了 5 个大模型的 API Key。
        </div>`;
    }
}
window.onload = loadPredictions;
