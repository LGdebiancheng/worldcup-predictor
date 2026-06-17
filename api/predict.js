module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { home, away } = req.body;

    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({
            success: false,
            error: '未设置 DEEPSEEK_API_KEY 环境变量'
        });
    }

    const prompt = `预测足球比赛：${home} vs ${away}。只返回JSON：{"result":"主队胜/平局/客队胜","homeScore":数字,"awayScore":数字,"analysis":"一句话分析"}`;

    try {
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
            throw new Error(`DeepSeek API 错误: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const json = JSON.parse(content);

        res.status(200).json({
            success: true,
            data: {
                result: json.result || '未知',
                homeScore: json.homeScore ?? '?',
                awayScore: json.awayScore ?? '?',
                analysis: json.analysis || ''
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};