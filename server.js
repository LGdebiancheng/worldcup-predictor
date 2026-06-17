const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.post('/api/predict', async (req, res) => {
    const { home, away, odds } = req.body;
    const API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ success: false, error: '未设置 DEEPSEEK_API_KEY 环境变量' });
    }

    const prompt = `你是足球预测专家。请根据以下信息预测比赛结果：
主队：${home}，客队：${away}
赔率（胜/平/负）：${odds.win}/${odds.draw}/${odds.lose}，让球：${odds.handicap}

请以 JSON 格式返回以下字段：
{
  "win_draw_lose": {"prediction": "主队胜/平局/客队胜", "analysis": "理由"},
  "handicap": {"prediction": "主队赢盘/走盘/客队赢盘", "analysis": "理由"},
  "total_goals": {"prediction": "大球/小球", "analysis": "理由"},
  "half_full": {"prediction": "胜胜/胜平/胜负/平胜/平平/平负/负胜/负平/负负", "analysis": "理由"},
  "correct_score": {"prediction": "具体比分如 2:1", "analysis": "理由"}
}
只返回JSON，不要其他文字。`;

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
        if (!response.ok) throw new Error(`DeepSeek API 错误: ${response.status}`);
        const data = await response.json();
        const content = data.choices[0].message.content;
        const json = JSON.parse(content);
        res.json({ success: true, data: json });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));