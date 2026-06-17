// 使用 Node.js 内置 fetch (Node.js 18+ 自带，不需要安装 axios)
module.exports = async (req, res) => {
    // 设置跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { home, away, homeElo, awayElo } = req.body;

    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) {
        console.error('❌ 错误：未设置 DEEPSEEK_API_KEY 环境变量');
        return res.status(500).json({
            success: false,
            error: '服务器配置错误：未设置 DeepSeek API Key',
            tip: '请在 Vercel 项目设置中添加环境变量 DEEPSEEK_API_KEY'
        });
    }

    const systemPrompt = `你是一个顶尖的足球数据分析师和预测专家。
请根据球队实力（用 ELO 积分表示，越高越强）预测比赛结果。
你必须以**严格的 JSON 格式**返回结果，不要包含任何其他文字或解释。
JSON 格式必须为：
{
  "result": "主队胜" 或 "平局" 或 "客队胜",
  "homeScore": 数字（主队进球数）,
  "awayScore": 数字（客队进球数）,
  "analysis": "一句话简要分析（20字以内）"
}`;

    const userPrompt = `预测比赛：
主队：${home}（ELO积分：${homeElo}）
客队：${away}（ELO积分：${awayElo}）`;

    try {
        console.log(`🤖 正在调用 DeepSeek 预测: ${home} vs ${away}`);

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('DeepSeek API 错误:', errorText);
            throw new Error(`DeepSeek API 返回错误: ${response.status}`);
        }

        const data = await response.json();
        const aiMessage = data.choices[0].message.content;
        console.log('📥 DeepSeek 返回:', aiMessage);

        let prediction;
        try {
            prediction = JSON.parse(aiMessage);
        } catch (parseError) {
            const match = aiMessage.match(/\{.*\}/s);
            if (match) {
                prediction = JSON.parse(match[0]);
            } else {
                throw new Error('AI 返回内容无法解析为 JSON');
            }
        }

        if (!prediction.result || prediction.homeScore === undefined || prediction.awayScore === undefined) {
            throw new Error('AI 返回数据缺少必要字段');
        }

        res.status(200).json({
            success: true,
            data: {
                result: prediction.result,
                homeScore: prediction.homeScore,
                awayScore: prediction.awayScore,
                analysis: prediction.analysis || 'AI 预测完成'
            }
        });

    } catch (error) {
        console.error('❌ DeepSeek API 调用失败:', error.message);
        res.status(500).json({
            success: false,
            error: 'AI 预测服务暂时不可用',
            detail: error.message,
            tip: '请稍后重试'
        });
    }
};