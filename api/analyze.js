// Vercel serverless function: POST /api/analyze
// Set ANTHROPIC_API_KEY (and optionally AI_MODEL) in Vercel -> Project Settings -> Environment Variables.
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const SYSTEM = `You are a crop-health assistant for Indian farmers. Look at the photos and the farm context.
Rules:
- Give a SUSPECTED condition and alternatives. A photo can never confirm a disease.
- Consider disease, pests, nutrient deficiency, water stress, heat stress, waterlogging, healthy, inconclusive.
- Use the weather/soil context only if provided. Missing data is unknown, never zero.
- Never name pesticides, doses or mixing rates. For chemical treatment say to use an authorised local expert or the product label.
- Do not give confidence percentages. Describe uncertainty in words.
- Suggest verification (local agriculture office / KVK / lab test).
Reply with ONLY a JSON object, no markdown, in exactly this shape:
{"label":string,"seen":string,"unc":string,"alts":[[string,string]],"act":[string],"prev":[string],"re":number}
"alts" = other possible causes as [name, how the evidence supports or weakens it]. "re" = days until re-check (1-14).`;

const isStrArr = (a) => Array.isArray(a) && a.every((x) => typeof x === 'string');
function validate(o) {
  const ok = o && typeof o.label === 'string' && typeof o.seen === 'string' && typeof o.unc === 'string' &&
    Array.isArray(o.alts) && o.alts.every((a) => Array.isArray(a) && a.length === 2 && a.every((x) => typeof x === 'string')) &&
    isStrArr(o.act) && isStrArr(o.prev) && Number.isFinite(o.re);
  if (!ok) throw new Error('Model returned an unexpected format');
  return { ...o, re: Math.min(14, Math.max(1, Math.round(o.re))) };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set' });

  const { images, context } = req.body || {};
  if (!Array.isArray(images) || images.length < 1 || images.length > 4)
    return res.status(400).json({ error: 'Send 1 to 4 images' });
  for (const i of images)
    if (!OK_TYPES.has(i?.type) || typeof i.data !== 'string' || i.data.length > 1_500_000)
      return res.status(400).json({ error: 'Each image must be JPEG, PNG or WebP and small enough' });

  const content = [
    ...images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.type, data: i.data } })),
    { type: 'text', text: 'Farm context (JSON, blank values mean unknown):\n' + JSON.stringify(context ?? {}).slice(0, 4000) },
  ];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-5-5', max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'AI service error ' + r.status);
    const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return res.status(200).json(validate(JSON.parse(text.replace(/```json|```/g, '').trim())));
  } catch (e) {
    console.error('analyze failed:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
