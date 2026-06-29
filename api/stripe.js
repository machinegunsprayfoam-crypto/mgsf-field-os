// MGSF deposit-link proxy (Vercel Node function, Node 18+ global fetch)
// SECURITY: the Stripe secret key is read ONLY from process.env.STRIPE_SECRET_KEY and is NEVER echoed.
// The owner/agent never touches money: this only mints a CUSTOMER-paid Stripe Checkout link that
// deposits into the owner's own Stripe account. We never create refunds or move funds here.
// POST { mode:"deposit", amount, proposalId?, customerName?, jobAddress?, email? }
//   -> { ok:true, url:"https://checkout.stripe.com/...", id:"cs_..." }
//   amount = deposit in US DOLLARS (app sends 50% of the job total). Clamped to [1, 1000000].
// Non-POST rejected (405). CORS preflight (OPTIONS) -> 204.
// If the key is missing/empty -> HTTP 200 {ok:false,error:"STRIPE_NOT_CONFIGURED"} so the app can
// show a friendly "Add your Stripe key to enable deposits" message instead of crashing.

const STRIPE_BASE = 'https://api.stripe.com/v1';
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1MB cap on body
const APP_ORIGIN = 'https://app.machinegunsprayfoam.info';
const UNSAFE_TEXT = new RegExp('[^\\x20-\\x7E]', 'g'); // strip non-printable / non-ASCII

// --- CORS: reflect origin only for our known domains ---
function allowOrigin(origin) {
  if (!origin) return null;
  let host;
  try { host = new URL(origin).hostname; } catch (e) { return null; }
  if (host === 'machinegunsprayfoam.info' || host.endsWith('.machinegunsprayfoam.info')) return origin;
  if (host.endsWith('.vercel.app')) return origin;
  if (host === 'localhost' || host === '127.0.0.1') return origin;
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

// Build an application/x-www-form-urlencoded body from a list of [key,value] pairs.
function formEncode(pairs) {
  return pairs.map(function (kv) {
    return encodeURIComponent(kv[0]) + '=' + encodeURIComponent(kv[1]);
  }).join('&');
}

// Sanitize free text for Stripe fields (length-capped; non-printable/non-ASCII -> space).
function clean(s, max) {
  return String(s == null ? '' : s).replace(UNSAFE_TEXT, ' ').trim().slice(0, max || 200);
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !String(key).trim()) {
    sendJson(res, 200, { ok: false, error: 'STRIPE_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const mode = (body && body.mode) || 'deposit';
  if (mode !== 'deposit') { sendJson(res, 400, { ok: false, error: 'BAD_MODE' }); return; }

  // amount is in dollars; clamp to a sane range and convert to integer cents.
  let dollars = Number(body && body.amount);
  if (!isFinite(dollars) || dollars <= 0) { sendJson(res, 400, { ok: false, error: 'BAD_AMOUNT' }); return; }
  if (dollars < 1) dollars = 1;
  if (dollars > 1000000) dollars = 1000000;
  const cents = Math.round(dollars * 100);

  const proposalId = clean(body && body.proposalId, 80);
  const customerName = clean(body && body.customerName, 120);
  const jobAddress = clean(body && body.jobAddress, 200);
  const email = clean(body && body.email, 160);
  const label = 'Deposit (50%)' + (proposalId ? ' - Proposal #' + proposalId : '') + ' - Machine Gun Spray Foam';

  // Build the Checkout Session request (form-encoded, Stripe bracket notation).
  const pairs = [
    ['mode', 'payment'],
    ['success_url', APP_ORIGIN + '/?deposit=paid&pid=' + encodeURIComponent(proposalId)],
    ['cancel_url', APP_ORIGIN + '/?deposit=cancel&pid=' + encodeURIComponent(proposalId)],
    ['payment_method_types[0]', 'card'],
    ['payment_method_types[1]', 'us_bank_account'],
    ['line_items[0][quantity]', '1'],
    ['line_items[0][price_data][currency]', 'usd'],
    ['line_items[0][price_data][unit_amount]', String(cents)],
    ['line_items[0][price_data][product_data][name]', label],
    ['metadata[proposalId]', proposalId],
    ['metadata[customerName]', customerName],
    ['metadata[jobAddress]', jobAddress],
    ['metadata[source]', 'MGSF Field OS']
  ];
  if (email) pairs.push(['customer_email', email]);
  if (jobAddress) pairs.push(['line_items[0][price_data][product_data][description]', ('Project: ' + jobAddress).slice(0, 200)]);

  try {
    const r = await fetch(STRIPE_BASE + '/checkout/sessions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + key,
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: formEncode(pairs)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Surface only a safe category/code, never the key or full body.
      const safe = (data && data.error && (data.error.code || data.error.type)) ? String(data.error.code || data.error.type) : ('http_' + r.status);
      sendJson(res, 200, { ok: false, error: 'STRIPE_ERROR', detail: safe });
      return;
    }
    sendJson(res, 200, { ok: true, url: data.url, id: data.id });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: 'STRIPE_ERROR', detail: 'unexpected' });
  }
};
