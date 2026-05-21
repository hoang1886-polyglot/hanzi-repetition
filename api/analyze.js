export default async function handler(req, res) {
  // CORS headers — cho phép web của bạn gọi được
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

  const prompt = `Analyze this Chinese sentence and return ONLY a JSON object. No markdown, no explanation.

Sentence: "${sentence.trim()}"

Return exactly this structure:
{
  "segments": [
    {"text": "word/phrase", "role": "S|V|O|adv|other", "pinyin": "pinyin with tones", "meaning": "nghĩa tiếng Việt"}
  ],
  "summary": {"S": "subject text or null", "V": "verb text or null", "O": "object text or null"},
  "explanation": "1-2 câu tiếng Việt giải thích cấu trúc ngữ pháp của câu này"
}

Role rules:
- S = subject (chủ ngữ)
- V = verb/predicate (vị ngữ, có thể gồm cả tính từ vị ngữ)
- O = object (tân ngữ)
- adv = adverbial/complement (trạng ngữ, bổ ngữ, thời gian, địa điểm)
- other = particles, conjunctions, punctuation`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Gemini API lỗi: ' + (err.error?.message || geminiRes.status) });
    }

    const geminiData = await geminiRes.json();
    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: 'Lỗi phân tích: ' + e.message });
  }
}
