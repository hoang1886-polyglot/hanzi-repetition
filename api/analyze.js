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

  // Escape input an toàn
  const safeSentence = sentence.trim()
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ');

  const prompt = `You are a Chinese grammar analyzer. Analyze the grammar of this Chinese sentence and return ONLY a valid JSON object with no markdown, no code fences, no extra text before or after.

Chinese sentence: ${safeSentence}

Return exactly this JSON structure (all strings must be properly JSON-escaped):
{
  "segments": [
    {"text": "词", "role": "S", "pinyin": "cí", "meaning": "nghĩa tiếng Việt"}
  ],
  "summary": {"S": "subject or null", "V": "verb or null", "O": "object or null"},
  "explanation": "1-2 câu tiếng Việt giải thích cấu trúc ngữ pháp"
}

Role values: S (chủ ngữ), V (vị ngữ), O (tân ngữ), adv (trạng ngữ), other (hư từ/dấu câu)`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024
            // Không dùng responseMimeType — tránh conflict với thinking mode
          }
        })
      }
    );

    // Log HTTP status
    console.log('Gemini HTTP status:', geminiRes.status);

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini error body:', errBody);
      return res.status(502).json({ error: 'Gemini API lỗi: ' + geminiRes.status, detail: errBody.slice(0, 300) });
    }

    const geminiData = await geminiRes.json();

    // Log toàn bộ response để debug
    console.log('Gemini response:', JSON.stringify(geminiData).slice(0, 1000));

    // Gemini 2.5 có thinking parts — lấy text part cuối cùng
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    console.log('Parts count:', parts.length, '| types:', parts.map(p => p.thought ? 'thought' : 'text'));

    // Lọc chỉ lấy part KHÔNG phải thought
    const textPart = parts.filter(p => !p.thought).map(p => p.text).join('');
    console.log('Text part raw:', textPart.slice(0, 500));

    // Bóc markdown fence nếu còn
    const clean = textPart
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // Tìm JSON object trong string (phòng trường hợp có text thừa đầu/cuối)
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON object found in:', clean);
      return res.status(500).json({ error: 'Model không trả về JSON, vui lòng thử lại.' });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (e) {
    console.error('Handler error:', e.message, e.stack);
    return res.status(500).json({ error: 'Lỗi phân tích: ' + e.message });
  }
}
