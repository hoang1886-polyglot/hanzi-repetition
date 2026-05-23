// Vercel serverless function — calls Google Gemini Flash to analyse Chinese grammar.
// Free tier: https://aistudio.google.com/apikey  (1 M tokens/day, 15 RPM, no credit card)
// Add GEMINI_API_KEY in Vercel Dashboard → Settings → Environment Variables.

const PROMPT = (text) =>
`You are a Chinese grammar analyzer. Segment the text into natural words/phrases and classify each token's grammatical role.

Roles (use exactly these keys):
- subject   : 主语 — who/what performs the action
- predicate : 谓语 — main verb or adjectival predicate of the sentence
- object    : 宾语 — who/what receives the action
- complement: 补语 — result / degree / directional complement
- modifier  : 定语/状语 — attributive modifier for nouns; adverbial modifier for verbs/adjectives
- other     : 助词/副词/介词/连词/标点 — particles (了/的/地/得/着/过), prepositions, conjunctions, punctuation, auxiliary verbs

Return ONLY the following JSON — no markdown fences, no extra text:
{"sentences":[{"tokens":[{"text":"...","role":"subject|predicate|object|complement|modifier|other"}]}]}

Text: ${text}`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const text = (req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'text is required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured — add it in Vercel → Settings → Environment Variables' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT(text) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!r.ok) {
      const msg = await r.text().catch(() => String(r.status));
      return res.status(r.status).json({ error: `Gemini API: ${msg}` });
    }

    const raw    = await r.json();
    const content = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return res.status(500).json({ error: 'Empty response from Gemini' });

    let parsed;
    try { parsed = JSON.parse(content); }
    catch (_) { return res.status(500).json({ error: 'Gemini returned non-JSON' }); }

    return res.json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
