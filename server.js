const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/predict', async (req, res) => {
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

        res.json({
            success: true,
            data: {
                result: json.result || '未知',
                homeScore: json.homeScore ?? '?',
                awayScore: json.awayScore ?? '?',
                analysis: json.analysis || ''
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});