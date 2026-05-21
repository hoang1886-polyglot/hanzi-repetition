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

  const prompt = `Analyze this Chinese sentence for grammar structure.

Sentence: "${sentence.trim()}"

Return a JSON object with this exact structure:
{
  "segments": [
    {"text": "word/phrase", "role": "S", "pinyin": "pinyin with tones", "meaning": "nghĩa tiếng Việt"}
  ],
  "summary": {"S": "subject text or null", "V": "verb text or null", "O": "object text or null"},
  "explanation": "1-2 câu tiếng Việt giải thích cấu trúc ngữ pháp"
}

Role values: S (subject/chủ ngữ), V (verb/vị ngữ), O (object/tân ngữ), adv (trạng ngữ), other (hư từ)`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'   // ← ép Gemini trả JSON thuần
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.json().catch(() => ({}));
      return res.status(502).json({ error: 'Gemini API lỗi: ' + (err.error?.message || geminiRes.status) });
    }

    const geminiData = await geminiRes.json();

    // Gemini 2.5 Flash có thể trả về nhiều parts (thinking + answer)
    // Lấy part cuối cùng là output thực sự
    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const raw = parts[parts.length - 1]?.text || '';

    // Làm sạch phòng thủ: bóc markdown fence nếu vẫn còn
    const clean = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: 'Lỗi phân tích: ' + e.message });
  }
}
