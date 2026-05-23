// Vercel serverless function — CORS proxy to HanLP public REST API.
// No API key or registration required; HanLP public tier is free (auth=None).
// Uses CommonJS (module.exports) — no package.json "type":"module" needed.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const text = (req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'text is required' });

  try {
    const r = await fetch('https://www.hanlp.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ text, tasks: ['tok/fine', 'dep'], language: 'zh' }),
    });

    if (!r.ok) {
      const msg = await r.text().catch(() => String(r.status));
      return res.status(r.status).json({ error: `HanLP: ${msg}` });
    }

    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
