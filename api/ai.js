// MGSF "AI Bidder" serverless proxy (Vercel Node function, Node 18+ global fetch)
// SECURITY: the Anthropic API key is read ONLY from process.env and is NEVER echoed.
// POST { mode:"parse"|"takeoff", text?, files? } -> JSON. Non-POST rejected.
// If the key is missing/empty -> HTTP 200 {ok:false,error:"AI_NOT_CONFIGURED"} so the app
// can show a friendly "AI setup needed" message instead of crashing.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_BODY_BYTES = 8 * 1024 * 1024; // ~8MB cap on upload

// --- CORS: allow same-origin; reflect origin only for our known domains ---
function allowOrigin(origin) {
  if (!origin) return null; // same-origin / non-CORS requests have no Origin header
  let host;
  try { host = new URL(origin).hostname; } catch (e) { return null; }
  if (host === 'machinegunsprayfoam.info' || host.endsWith('.machinegunsprayfoam.info')) return origin;
  if (host.endsWith('.vercel.app')) return origin; // the project's vercel.app domain
  if (host === 'localhost' || host === '127.0.0.1') return origin; // local dev
  return null;
}

function setCors(req, res) {
  const reflected = allowOrigin(req.headers.origin);
  if (reflected) res.setHeader('Access-Control-Allow-Origin', reflected);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  // Vercel may already parse JSON onto req.body; otherwise read the stream.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    if (Buffer.byteLength(req.body) > MAX_BODY_BYTES) throw new Error('TOO_LARGE');
    return JSON.parse(req.body);
  }
  return await new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('TOO_LARGE')); try { req.destroy(); } catch (e) {} return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

// Pull the first {...} JSON object out of a model text reply.
function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function callAnthropic(apiKey, payload) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const safe = (data && data.error && data.error.type) ? data.error.type : ('http_' + r.status);
    const e = new Error('AI_ERROR'); e.detail = safe; throw e;
  }
  // Concatenate text content blocks
  let text = '';
  if (Array.isArray(data.content)) {
    for (const blk of data.content) { if (blk && blk.type === 'text' && blk.text) text += blk.text; }
  }
  return text;
}

const PARSE_SYSTEM =
  'You extract spray-foam / roofing / concrete-lifting / coatings job inputs from a spoken or typed ' +
  'job description for a field estimator. Output ONLY a strict JSON object, no prose, no markdown fences. ' +
  'Shape: {"customer":{"name":string,"phone":string,"address":string,"state":string},"market":' +
  '"residential"|"commercial"|"government"|"agricultural","service":"foam"|"roof"|"concrete"|"coatings",' +
  '"foamProductHint":string,"thickness":number,"areaSqft":number,"lengthFt":number,"widthFt":number,' +
  '"zones":number,"roofShape":string,"coats":number,"notes":string}. ' +
  'Include ONLY fields you can infer from the text. Numbers must be JSON numbers, not strings. ' +
  'Omit anything unknown. state is the 2-letter US code. If unsure of service, pick the best guess.';

const TAKEOFF_SYSTEM =
  'You are assisting a spray-foam contractor by producing a DRAFT takeoff from plan sets or spec sheets ' +
  '(PDF/images). This is a DRAFT for human review only and must be verified line by line by an estimator; ' +
  'never present it as final. Output ONLY strict JSON, no prose, no markdown fences. ' +
  'Shape: {"scopes":[{"service":"foam"|"roof"|"concrete"|"coatings","sqft":number,"foamProductHint":string,' +
  '"thickness":number,"notes":string,"confidence":"low"|"medium"|"high"}],"warnings":[string]}. ' +
  'Each scope is one measurable area. Put assumptions and anything ambiguous in notes/warnings. ' +
  'Use conservative confidence when measurements are inferred rather than labeled.';

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    sendJson(res, 200, { ok: false, error: 'AI_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const mode = body && body.mode;

  try {
    if (mode === 'parse') {
      const text = String((body && body.text) || '').slice(0, 8000);
      if (!text.trim()) { sendJson(res, 400, { ok: false, error: 'NO_TEXT' }); return; }
      const reply = await callAnthropic(apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: PARSE_SYSTEM,
        messages: [{ role: 'user', content: 'Job description:\n' + text }]
      });
      const parsed = extractJson(reply);
      if (!parsed) { sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'unparseable_model_output' }); return; }
      sendJson(res, 200, { ok: true, parsed: parsed });
      return;
    }

    if (mode === 'takeoff') {
      const files = Array.isArray(body && body.files) ? body.files : [];
      if (!files.length) { sendJson(res, 400, { ok: false, error: 'NO_FILES' }); return; }
      const content = [];
      for (const f of files.slice(0, 10)) {
        if (!f || !f.dataB64) continue;
        const mime = String(f.mime || '');
        if (mime === 'application/pdf') {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
        } else if (mime.indexOf('image/') === 0) {
          content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: f.dataB64 } });
        }
      }
      if (!content.length) { sendJson(res, 400, { ok: false, error: 'NO_USABLE_FILES' }); return; }
      content.push({ type: 'text', text: 'Produce the DRAFT takeoff JSON for the attached plan/spec files. Remember: draft for human review.' });
      const reply = await callAnthropic(apiKey, {
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: TAKEOFF_SYSTEM,
        messages: [{ role: 'user', content: content }]
      });
      const draft = extractJson(reply) || {};
      sendJson(res, 200, {
        ok: true,
        scopes: Array.isArray(draft.scopes) ? draft.scopes : [],
        warnings: Array.isArray(draft.warnings) ? draft.warnings : []
      });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'BAD_MODE' });
  } catch (e) {
    if (e && e.message === 'AI_ERROR') { sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: e.detail || 'upstream' }); return; }
    sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'unexpected' });
  }
};
