// MGSF follow-up email sender (Vercel Node 18+ serverless function)
// SECURITY: RESEND_API_KEY is read ONLY from process.env and is NEVER echoed.
// POST { to, customerName, proposalId, proposalUrl?, depositUrl?, driveDocUrl?, message? }
//   → { ok:true, emailId }
// mode:"review" → sends a Google Review request instead
// Non-POST → 405. CORS preflight → 204.
// Missing key → { ok:false, error:"RESEND_NOT_CONFIGURED" }

const RESEND_API = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'MGSF Field OS <proposals@machinegunsprayfoam.info>';
const FROM_REVIEW = 'Machine Gun Spray Foam <reviews@machinegunsprayfoam.info>';
const REVIEW_URL = 'https://www.google.com/search?q=Machine+Gun+Spray+Foam+%26+Concrete+Lifting+Glendive+MT';
const MAX_BODY_BYTES = 256 * 1024; // 256 KB

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

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clean(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max || 500);
}

function proposalEmailHtml({ customerName, proposalId, totalFormatted, depositFormatted,
  proposalUrl, driveDocUrl, depositUrl, message }) {
  const linkBtn = (href, text) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;background:#C8102E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;font-size:14px;margin:6px 0">${esc(text)}</a>`;

  const links = [
    proposalUrl ? linkBtn(proposalUrl, '📄 View Proposal') : '',
    driveDocUrl ? linkBtn(driveDocUrl, '📄 Open Google Doc') : '',
    depositUrl ? linkBtn(depositUrl, '💳 Pay 50% Deposit Online') : ''
  ].filter(Boolean).join(' &nbsp; ');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#0d0d0f;padding:24px 28px;border-bottom:3px solid #C8102E">
    <div style="color:#fff;font-size:18px;font-weight:bold">Machine Gun Spray Foam &amp; Concrete Lifting, LLC</div>
    <div style="color:#aaa;font-size:12px;margin-top:4px">Veteran-Owned · Glendive, MT · 406-939-8301</div>
  </div>
  <div style="padding:28px 28px 20px">
    <p style="font-size:15px;font-weight:bold;color:#111;margin-top:0">Hi ${esc(customerName)},</p>
    <p style="font-size:14px;color:#374151;line-height:1.7">
      ${message
        ? esc(message)
        : `Thank you for the opportunity to bid your project. Please find your proposal below.${
            proposalId ? ' This proposal is referenced as <strong>#' + esc(proposalId) + '</strong>.' : ''
          }`}
    </p>
    ${totalFormatted ? `<p style="font-size:14px;color:#374151"><strong>Project Total:</strong> ${esc(totalFormatted)}</p>` : ''}
    ${depositFormatted ? `<p style="font-size:14px;color:#374151"><strong>50% Deposit Due at Signing:</strong> ${esc(depositFormatted)}</p>` : ''}
    ${links ? `<div style="margin:20px 0">${links}</div>` : ''}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="font-size:13px;color:#6b7280;line-height:1.7">
      Questions? Call or text Clifton at <strong>406-939-8301</strong> or reply to this email.
      We serve MT, ND, SD, and WY for spray foam insulation, SPF roofing, concrete lifting, polyurea coatings, and more.
    </p>
    <p style="font-size:13px;color:#6b7280">
      💳 <strong>Financing available</strong> — 0% options through Hearth.
      <a href="https://app.gethearth.com/partners/machine-gun-spray-foam-and-concrete-lifting/clifton/apply" style="color:#16a34a">Apply in minutes</a>
    </p>
  </div>
  <div style="background:#f9fafb;padding:14px 28px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    Machine Gun Spray Foam &amp; Concrete Lifting, LLC · EIN 33-3866517 · UEI H63EELL3K7Z4 · SAM Active · VOSB<br>
    BPI Certified · $1M Liability Insured · machinegunsprayfoam.info
  </div>
</div>
</body></html>`;
}

function reviewEmailHtml({ customerName }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#0d0d0f;padding:24px 28px;border-bottom:3px solid #C8102E">
    <div style="color:#fff;font-size:18px;font-weight:bold">Machine Gun Spray Foam &amp; Concrete Lifting, LLC</div>
    <div style="color:#aaa;font-size:12px;margin-top:4px">Veteran-Owned · Glendive, MT · 406-939-8301</div>
  </div>
  <div style="padding:28px 28px 20px">
    <p style="font-size:15px;font-weight:bold;color:#111;margin-top:0">Hi ${esc(customerName)},</p>
    <p style="font-size:14px;color:#374151;line-height:1.7">
      Thank you for choosing Machine Gun Spray Foam &amp; Concrete Lifting! It was a pleasure serving you.
    </p>
    <p style="font-size:14px;color:#374151;line-height:1.7">
      If you were happy with our work, a quick Google review would mean a lot to our veteran-owned crew and helps other homeowners and businesses find us.
      It takes less than a minute:
    </p>
    <div style="margin:20px 0;text-align:center">
      <a href="${esc(REVIEW_URL)}" target="_blank" rel="noopener"
        style="display:inline-block;background:#C8102E;color:#fff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:bold;font-size:15px">
        ⭐ Leave a Google Review
      </a>
    </div>
    <p style="font-size:13px;color:#6b7280;line-height:1.7">
      Questions or need follow-up work? Call or text Clifton at <strong>406-939-8301</strong> or reply here.
      We handle spray foam, SPF roofing, concrete lifting, polyurea coatings, and more across MT, ND, SD, and WY.
    </p>
  </div>
  <div style="background:#f9fafb;padding:14px 28px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
    Machine Gun Spray Foam &amp; Concrete Lifting, LLC · machinegunsprayfoam.info
  </div>
</div>
</body></html>`;
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    sendJson(res, 200, { ok: false, error: 'RESEND_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const to = clean((body && body.to) || '', 200);
  if (!to || !to.includes('@')) { sendJson(res, 400, { ok: false, error: 'NO_TO' }); return; }

  const mode = (body && body.mode) || 'proposal';
  const customerName = clean((body && body.customerName) || 'Valued Customer', 120);
  const proposalId = clean((body && body.proposalId) || '', 60);
  const total = Number((body && body.total) || 0);
  const deposit = Math.round(total * 0.5 * 100) / 100;

  const totalFormatted = total > 0 ? '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';
  const depositFormatted = deposit > 0 ? '$' + deposit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';

  let subject, html, from;

  if (mode === 'review') {
    from = FROM_REVIEW;
    subject = 'Thank you — leave us a quick Google review';
    html = reviewEmailHtml({ customerName });
  } else {
    from = FROM_ADDRESS;
    subject = 'Your proposal from Machine Gun Spray Foam' + (proposalId ? ' — #' + proposalId : '');
    html = proposalEmailHtml({
      customerName,
      proposalId,
      totalFormatted,
      depositFormatted,
      proposalUrl: clean((body && body.proposalUrl) || '', 2000),
      driveDocUrl: clean((body && body.driveDocUrl) || '', 2000),
      depositUrl: clean((body && body.depositUrl) || '', 2000),
      message: clean((body && body.message) || '', 2000)
    });
  }

  try {
    const r = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const safe = (data && data.name) ? String(data.name) : ('http_' + r.status);
      sendJson(res, 200, { ok: false, error: 'RESEND_ERROR', detail: safe });
      return;
    }
    sendJson(res, 200, { ok: true, emailId: data.id || null });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: 'RESEND_ERROR', detail: 'unexpected' });
  }
};
