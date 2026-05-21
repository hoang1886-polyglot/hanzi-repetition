export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sentence } = req.body || {};
  if (!sentence || !sentence.trim()) {
    return res.status(400).json({ error: 'Thiếu câu cần phân tích' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key chưa được cấu hình' });

  // Escape câu input — tránh dấu đặc biệt tiếng Trung làm vỡ JSON trong prompt
  const safeSentence = sentence.trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');

  // Truyền câu qua system+user message thay vì nhúng thẳng vào prompt string
  const systemInstruction = `You are a Chinese grammar analyzer. 
When given a Chinese sentence, analyze its grammatical structure and return ONLY valid JSON.
Never include markdown, code fences, comments, or any text outside the JSON object.`;

  const userPrompt = `Analyze the grammar of this Chinese sentence: ${safeSentence}

Return this exact JSON structure:
{
  "segments": [
    {"text": "词", "role": "S", "pinyin": "cí", "meaning": "nghĩa tiếng Việt"}
  ],
  "summary": {"S": "subject or null", "V": "verb or null", "O": "object or null"},
  "explanation": "1-2 câu tiếng Việt giải thích cấu trúc ngữ pháp"
}

Role values: S (chủ ngữ), V (vị ngữ), O (tân ngữ), adv (trạng ngữ), other (hư từ/dấu câu)
Important: all string values in JSON must be properly escaped. Return valid JSON only.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Gemini API lỗi: ' + (err.error?.message || geminiRes.status) });
    }

    const geminiData = await geminiRes.json();

    // Gemini 2.5 Flash có thinking parts — luôn lấy part cuối
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const raw = parts[parts.length - 1]?.text || '';

    // Làm sạch phòng thủ
    const clean = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Parse với try riêng để trả lỗi rõ hơn
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      // Log raw để debug trên Vercel logs
      console.error('JSON parse failed. Raw response:', raw);
      return res.status(500).json({
        error: 'Model trả về dữ liệu không hợp lệ, vui lòng thử lại.',
        debug: raw.slice(0, 200)
      });
    }

    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi phân tích: ' + e.message });
  }
}
