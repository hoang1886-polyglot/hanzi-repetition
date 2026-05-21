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

  const prompt = `Analyze the grammar of this Chinese sentence.
Sentence: ${sentence.trim()}

Return ONLY a JSON object. No markdown. No explanation outside JSON.

Example output format:
{"segments":[{"text":"我","role":"S","pinyin":"wǒ","meaning":"tôi"},{"text":"爱","role":"V","pinyin":"ài","meaning":"yêu"},{"text":"你","role":"O","pinyin":"nǐ","meaning":"bạn"}],"summary":{"S":"我","V":"爱","O":"你"},"explanation":"Câu đơn giản S-V-O."}

Role values: S=chủ ngữ, V=vị ngữ, O=tân ngữ, adv=trạng ngữ, other=hư từ`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini HTTP error:', geminiRes.status, errBody.slice(0, 300));
      return res.status(502).json({ error: 'Gemini API lỗi ' + geminiRes.status });
    }

    const geminiData = await geminiRes.json();
    console.log('Gemini raw:', JSON.stringify(geminiData).slice(0, 800));

    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const raw = parts.map(p => p.text || '').join('').trim();

    // Strip markdown fences nếu có
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Extract JSON object
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('No JSON found:', clean.slice(0, 300));
      return res.status(500).json({ error: 'Model không trả về JSON hợp lệ, thử lại.' });
    }

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);

  } catch (e) {
    console.error('Error:', e.message);
    return res.status(500).json({ error: 'Lỗi: ' + e.message });
  }
}
