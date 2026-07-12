// MGSF Follow-up email proxy (Vercel Node function, Node 18+ global fetch)
// SECURITY: the Resend API key is read ONLY from process.env and is NEVER echoed.
// POST { type:"review"|"followup"|"proposal", to, customerName, jobAddress?, message?, ... }
//   -> { ok, id }
// Non-POST rejected (405). CORS preflight (OPTIONS) -> 204.
// Required env var: RESEND_API_KEY
//   Domain to verify in Resend: machinegunsprayfoam.info (From: noreply@machinegunsprayfoam.info)
// If key is missing -> HTTP 200 { ok:false, error:"EMAIL_NOT_CONFIGURED" }.

const RESEND_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Machine Gun Spray Foam <noreply@machinegunsprayfoam.info>';
const GOOGLE_REVIEW_URL =
  'https://www.google.com/search?q=Machine+Gun+Spray+Foam+%26+Concrete+Lifting+Glendive+MT+reviews';
const MAX_BODY_BYTES = 512 * 1024;

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

function clean(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max || 500);
}

function safeEq(a, b) {
  const crypto = require('crypto');
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Email templates ──────────────────────────────────────────────────────────

function baseLayout(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#111}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .header{background:#C8102E;padding:24px 32px}
  .header h1{margin:0;color:#fff;font-size:22px;letter-spacing:.5px}
  .header p{margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px}
  .body{padding:28px 32px;line-height:1.65;font-size:15px}
  .cta{display:inline-block;background:#C8102E;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:16px;margin:16px 0}
  .footer{background:#f4f4f5;padding:16px 32px;font-size:12px;color:#888;text-align:center}
  .divider{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Machine Gun Spray Foam</h1>
    <p>Spray Foam · Roofing · Concrete Lifting · Polyurea · MT/WY/ND/SD</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    Machine Gun Spray Foam &amp; Concrete Lifting LLC · Veteran-owned · BPI-certified<br>
    Glendive, MT · (406) 330-0043 · machinegunsprayfoam.info
  </div>
</div>
</body></html>`;
}

function reviewEmail(name) {
  return baseLayout(`
<p>Hi ${esc(name)},</p>
<p>Thank you so much for choosing Machine Gun Spray Foam &amp; Concrete Lifting! We truly appreciate your business and hope the work exceeded your expectations.</p>
<p>If you have two minutes, a Google review means the world to our veteran-owned crew — it helps other homeowners and businesses in the region find us:</p>
<p style="text-align:center">
  <a class="cta" href="${GOOGLE_REVIEW_URL}">⭐ Leave a Google Review</a>
</p>
<p>If anything wasn't perfect, please reply to this email or call us at (406) 330-0043 — we'll make it right.</p>
<p>Thank you again,<br><strong>Clifton Behner</strong><br>Machine Gun Spray Foam &amp; Concrete Lifting LLC</p>`);
}

function followupEmail(name, jobAddress, message) {
  const addrLine = jobAddress ? `<p><strong>Project address:</strong> ${esc(jobAddress)}</p>` : '';
  const bodyMsg = message
    ? `<p>${esc(message)}</p>`
    : `<p>We wanted to follow up on your recent inquiry. We'd love to answer any questions and get you on the schedule.</p>`;
  return baseLayout(`
<p>Hi ${esc(name)},</p>
${bodyMsg}
${addrLine}
<p>Feel free to reply to this email, call us at <a href="tel:4063300043">(406) 330-0043</a>, or <a href="https://www.machinegunsprayfoam.info">visit our website</a> to learn more.</p>
<p>Looking forward to earning your business,<br><strong>Clifton Behner</strong><br>Machine Gun Spray Foam &amp; Concrete Lifting LLC</p>
<p style="font-size:13px;color:#555">Serving Montana, Wyoming, North Dakota &amp; South Dakota · Veteran-owned</p>`);
}

function proposalEmail(name, jobAddress, totalFormatted, proposalId) {
  const addrLine = jobAddress ? `<p><strong>Project address:</strong> ${esc(jobAddress)}</p>` : '';
  const totalLine = totalFormatted ? `<p><strong>Total investment:</strong> ${esc(totalFormatted)}</p>` : '';
  const propLine = proposalId ? `<p style="font-size:13px;color:#555">Proposal #${esc(proposalId)}</p>` : '';
  return baseLayout(`
<p>Hi ${esc(name)},</p>
<p>Thank you for the opportunity to bid on your project. Please find your proposal details below. We're excited about the chance to work with you!</p>
${addrLine}
${totalLine}
<p>This proposal covers our full scope of work, warranty, and timeline. We stand behind every job — our crew is BPI-certified and fully insured.</p>
<p>To move forward, simply reply to this email or give us a call. We're ready to get you scheduled.</p>
<hr class="divider">
<p>Questions? We're here:<br>📞 <a href="tel:4063300043">(406) 330-0043</a><br>🌐 <a href="https://www.machinegunsprayfoam.info">machinegunsprayfoam.info</a></p>
${propLine}
<p>Thank you again,<br><strong>Clifton Behner</strong><br>Machine Gun Spray Foam &amp; Concrete Lifting LLC</p>`);
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    sendJson(res, 200, { ok: false, error: 'EMAIL_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const to = clean(body.to, 160);
  if (!to || !to.includes('@')) {
    sendJson(res, 400, { ok: false, error: 'BAD_EMAIL' });
    return;
  }

  const type = clean(body.type || 'followup', 20);
  const name = clean(body.customerName || 'Valued Customer', 80);
  const jobAddress = clean(body.jobAddress, 200);
  const message = clean(body.message, 2000);
  const totalFormatted = clean(body.totalFormatted, 40);
  const proposalId = clean(body.proposalId, 40);

  const authSecret = String(process.env.CREW_CODE || '').trim();
  const providedSecret = clean(
    req.headers['x-crew-code']
    || req.headers['x-api-key']
    || body.crewCode
    || body.authCode,
    200
  );
  if (!authSecret || !safeEq(authSecret, providedSecret)) {
    sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' });
    return;
  }

  let subject, html;
  if (type === 'review') {
    subject = 'Thank you from Machine Gun Spray Foam — Leave us a review!';
    html = reviewEmail(name);
  } else if (type === 'proposal') {
    subject = 'Your proposal from Machine Gun Spray Foam & Concrete Lifting'
      + (proposalId ? ' #' + proposalId : '');
    html = proposalEmail(name, jobAddress, totalFormatted, proposalId);
  } else {
    subject = 'Following up — Machine Gun Spray Foam & Concrete Lifting';
    html = followupEmail(name, jobAddress, message);
  }

  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const safe = (data && data.message)
        ? String(data.message).slice(0, 200)
        : ('http_' + r.status);
      sendJson(res, 200, { ok: false, error: 'EMAIL_ERROR', detail: safe });
      return;
    }
    sendJson(res, 200, { ok: true, id: data.id || null });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: 'EMAIL_ERROR', detail: 'unexpected' });
  }
};
