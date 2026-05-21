export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { sentence } = req.body;
  if (!sentence) return res.status(400).json({ error: 'Missing sentence' });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Analyze this Chinese sentence and return ONLY JSON...` }] }]
      })
    }
  );

  const data = await response.json();
  // parse và trả về
  res.json(result);
}
