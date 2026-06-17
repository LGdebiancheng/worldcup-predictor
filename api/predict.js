const axios = require('axios');

module.exports = async (req, res) => {
    // 1. 设置允许跨域（虽然同源，但加上无妨）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 只允许 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. 获取前端传来的比赛数据
    const { home, away, homeElo, awayElo } = req.body;

    // 检查环境变量中是否有 DeepSeek API Key（部署时需要设置）
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) {
        console.error('❌ 错误：未设置 DEEPSEEK_API_KEY 环境变量');
        return res.status(500).json({ 
            error: '服务器配置错误：未设置 DeepSeek API Key',
            tip: '请在 Vercel 项目设置中添加环境变量 DEEPSEEK_API_KEY'
        });
    }

    // 3. 构造发送给 DeepSeek 的提示词（Prompt）
    const systemPrompt = `你是一个顶尖的足球数据分析师和预测专家。你拥有丰富的足球知识和敏锐的洞察力。
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

        // 4. 调用 DeepSeek API
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }  // 强制返回 JSON
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                timeout: 30000 // 30秒超时
            }
        );

        // 5. 解析 DeepSeek 返回的数据
        const aiMessage = response.data.choices[0].message.content;
        console.log('📥 DeepSeek 原始返回:', aiMessage);

        // 尝试解析 JSON
        let prediction;
        try {
            prediction = JSON.parse(aiMessage);
        } catch (parseError) {
            console.error('⚠️ JSON 解析失败，尝试提取:', aiMessage);
            // 如果返回的不是纯 JSON，尝试用正则提取（容错处理）
            const match = aiMessage.match(/\{.*\}/s);
            if (match) {
                prediction = JSON.parse(match[0]);
            } else {
                throw new Error('AI 返回内容无法解析为 JSON');
            }
        }

        // 6. 验证返回数据结构
        if (!prediction.result || prediction.homeScore === undefined || prediction.awayScore === undefined) {
            throw new Error('AI 返回数据缺少必要字段');
        }

        // 7. 返回成功结果给前端
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
        if (error.response) {
            console.error('API 响应错误:', error.response.data);
        }
        
        // 返回友好的错误信息给前端
        res.status(500).json({
            success: false,
            error: 'AI 预测服务暂时不可用',
            detail: error.message,
            tip: '请稍后重试，或检查 DeepSeek API Key 是否有效'
        });
    }
};