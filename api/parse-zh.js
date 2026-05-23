// Vercel serverless function — proxies to HanLP REST API for Chinese dependency parsing.
// Set HANLP_TOKEN in Vercel Dashboard > Settings > Environment Variables.
// Register for a free token at: https://hanlp.hankcs.com/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const text = (req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'text is required' });

  const token = process.env.HANLP_TOKEN;
  if (!token) return res.status(500).json({ error: 'HANLP_TOKEN not configured on server' });

  try {
    const r = await fetch('https://hanlp.hankcs.com/api/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ text, tasks: ['tok/fine', 'dep'], language: 'zh' }),
    });

    if (!r.ok) {
      const msg = await r.text().catch(() => String(r.status));
      return res.status(r.status).json({ error: `HanLP API: ${msg}` });
    }

    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
