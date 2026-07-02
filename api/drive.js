// MGSF Google Drive proxy (Vercel Node 18+ serverless function)
// SECURITY: GOOGLE_SERVICE_ACCOUNT_JSON is read ONLY from process.env and is NEVER echoed.
// Uses a Google service account with JWT auth — no external OAuth libraries required (Node crypto).
//
// POST { mode:"folder", customerName, estimateNumber? }
//   → { ok:true, folderId, folderUrl }       Creates job subfolder inside GOOGLE_DRIVE_ROOT_FOLDER_ID
//
// POST { mode:"doc", bid: { id, customer, state, scopes, sellPrice, status, createdAt, ... } }
//   → { ok:true, docId, docUrl }             Creates a Google Doc proposal (HTML→Gdoc upload)
//
// Non-POST → 405. CORS preflight → 204.
// Missing env → { ok:false, error:"DRIVE_NOT_CONFIGURED" }

const crypto = require('crypto');

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_BODY_BYTES = 2 * 1024 * 1024;

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

// ---- Google service account JWT (RS256, no external deps) ----
function makeJwt(sa, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  })).toString('base64url');
  const unsigned = header + '.' + payload;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  return unsigned + '.' + sign.sign(sa.private_key, 'base64url');
}

async function getAccessToken(sa) {
  const jwt = makeJwt(sa, [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents'
  ]);
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('DRIVE_AUTH'); e.detail = String(d.error || ('http_' + r.status));
    throw e;
  }
  return d.access_token;
}

async function driveRequest(token, method, path, queryParams, body, contentType) {
  const qs = queryParams ? '?' + new URLSearchParams(queryParams).toString() : '';
  const r = await fetch(DRIVE_BASE + path + qs, {
    method,
    headers: Object.assign(
      { authorization: 'Bearer ' + token },
      contentType ? { 'content-type': contentType } : {}
    ),
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('DRIVE_ERROR');
    e.detail = (data && data.error && data.error.message)
      ? String(data.error.message).slice(0, 200) : ('http_' + r.status);
    throw e;
  }
  return data;
}

// Create (or find) a named subfolder inside parentId
async function ensureFolder(token, parentId, name) {
  // Sanitize for the Drive query: escape backslashes then single quotes
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const existing = await driveRequest(token, 'GET', '/files', {
    q, fields: 'files(id,name)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'
  });
  if (existing.files && existing.files.length) return existing.files[0].id;
  // Create new folder
  const created = await driveRequest(token, 'POST', '/files', null, {
    name, mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  }, 'application/json');
  return created.id;
}

// Build the proposal HTML content to upload as a Google Doc
function proposalHtml(bid) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = (v) => '$' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const cust = bid.customer || {};
  const scopes = Array.isArray(bid.scopes) ? bid.scopes : [];
  const scopeRows = scopes.map(s => {
    const svc = esc(s.service || '');
    const zone = s.zone ? ' — ' + esc(s.zone) : '';
    const product = s.product ? ' (' + esc(s.product) + ')' : '';
    const qty = s.sf ? esc(String(s.sf)) + ' sf' : (s.bf ? esc(String(s.bf)) + ' bf' : '1');
    return `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb">${svc}${zone}${product}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${qty}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${money(s.sell)}</td></tr>`;
  }).join('');

  const total = bid.sellPrice || bid.bidTotal || 0;
  const deposit = Math.round(total * 0.5 * 100) / 100;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; max-width: 720px; margin: 40px auto; color: #111; font-size: 13px; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 11px; color: #C8102E; text-transform: uppercase; letter-spacing: 0.06em; margin: 24px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { vertical-align: top; }
  th { background: #f3f4f6; padding: 8px; text-align: left; font-size: 12px; }
  .right { text-align: right; }
  .total-row td { font-weight: bold; font-size: 15px; padding: 10px 8px; border-top: 2px solid #C8102E; }
  .footer { margin-top: 40px; font-size: 11px; color: #888; text-align: center; }
  .sig-line { border-top: 1px solid #333; width: 260px; display: inline-block; margin-top: 40px; padding-top: 4px; font-size: 11px; color: #666; }
</style>
</head><body>
<div style="border-bottom:3px solid #C8102E;padding-bottom:12px;margin-bottom:20px">
  <h1>Machine Gun Spray Foam &amp; Concrete Lifting, LLC</h1>
  <div style="color:#666;font-size:12px">Veteran-Owned · Glendive, MT · 406-939-8301 · machinegunsprayfoam.info</div>
  <div style="font-size:11px;color:#888;margin-top:2px">BPI Certified · Serving MT / ND / SD / WY</div>
</div>

<h2>Proposal Details</h2>
<table>
  <tr><td style="color:#777;width:130px;padding:4px">Date</td><td style="padding:4px"><strong>${esc(dt)}</strong></td></tr>
  <tr><td style="color:#777;padding:4px">Valid Until</td><td style="padding:4px"><strong>${esc(new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</strong></td></tr>
  <tr><td style="color:#777;padding:4px">Prepared For</td><td style="padding:4px"><strong>${esc(cust.name)}</strong></td></tr>
  <tr><td style="color:#777;padding:4px">Phone</td><td style="padding:4px">${esc(cust.phone || '—')}</td></tr>
  <tr><td style="color:#777;padding:4px">Email</td><td style="padding:4px">${esc(cust.email || '—')}</td></tr>
  <tr><td style="color:#777;padding:4px">Location</td><td style="padding:4px">${esc((cust.address || '') + (bid.state ? ', ' + bid.state : ''))}</td></tr>
</table>

<h2>Scope of Work</h2>
<table>
  <thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>${scopeRows || '<tr><td colspan="3" style="padding:8px;color:#888">See attached scope notes.</td></tr>'}</tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="2">TOTAL INVESTMENT</td>
      <td style="text-align:right;color:#C8102E">${money(total)}</td>
    </tr>
    <tr><td colspan="2" style="padding:6px 8px;color:#777">50% Deposit Due at Signing</td>
      <td style="text-align:right;padding:6px 8px;font-weight:bold">${money(deposit)}</td></tr>
    <tr><td colspan="2" style="padding:6px 8px;color:#777">Balance Due on Completion</td>
      <td style="text-align:right;padding:6px 8px;font-weight:bold">${money(total - deposit)}</td></tr>
  </tfoot>
</table>

${bid.consoleNotes ? `<h2>Notes</h2><p style="font-size:13px;color:#374151;line-height:1.6">${esc(bid.consoleNotes)}</p>` : ''}

<h2>Terms &amp; Conditions</h2>
<ul style="font-size:12px;color:#555;line-height:1.8">
  <li>50% deposit to schedule; balance on completion.</li>
  <li>Valid 30 days from date above. Material pricing subject to change thereafter.</li>
  <li>Manufacturer-backed materials. 1-year workmanship warranty.</li>
  <li>Excludes hidden/structural damage, electrical/plumbing/HVAC, abatement, and permits unless stated.</li>
  <li>0% financing available through Hearth — ask for details or apply at machinegunsprayfoam.info.</li>
</ul>

<h2>Acceptance</h2>
<p style="font-size:12px;color:#555">By signing below, customer agrees to the scope of work and terms above.</p>
<div style="margin-top:20px;display:flex;gap:60px">
  <div><span class="sig-line">Customer Signature</span></div>
  <div><span class="sig-line">Date</span></div>
</div>
<div style="margin-top:20px;display:flex;gap:60px">
  <div><span class="sig-line">Print Name</span></div>
  <div><span class="sig-line">Proposal #${esc(bid.proposalId || bid.id || '')}</span></div>
</div>

<div class="footer">
  Machine Gun Spray Foam &amp; Concrete Lifting, LLC · Veteran-Owned · $1M Liability Insured · BPI Certified<br>
  EIN 33-3866517 · UEI H63EELL3K7Z4 · SAM Active · VOSB · 406-939-8301
</div>
</body></html>`;
}

// Multipart upload: file metadata + HTML body → Google Doc
async function createGoogleDoc(token, parentId, name, htmlContent) {
  const boundary = 'mgsf_boundary_' + Date.now();
  const meta = JSON.stringify({
    name,
    mimeType: 'application/vnd.google-apps.document',
    parents: parentId ? [parentId] : []
  });
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    meta,
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlContent,
    '--' + boundary + '--'
  ].join('\r\n');

  const r = await fetch(DRIVE_UPLOAD + '/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'multipart/related; boundary=' + boundary
    },
    body
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('DRIVE_ERROR');
    e.detail = (data && data.error && data.error.message)
      ? String(data.error.message).slice(0, 200) : ('http_' + r.status);
    throw e;
  }
  return data;
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!saJson || !rootFolderId) {
    sendJson(res, 200, { ok: false, error: 'DRIVE_NOT_CONFIGURED' });
    return;
  }

  let sa;
  try { sa = JSON.parse(saJson); } catch (e) {
    sendJson(res, 200, { ok: false, error: 'DRIVE_NOT_CONFIGURED', detail: 'bad_sa_json' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const mode = (body && body.mode) || 'folder';

  try {
    const token = await getAccessToken(sa);

    if (mode === 'folder') {
      const customerName = String((body && body.customerName) || 'Unknown').trim().slice(0, 120);
      const cleanCustomerName = customerName.replace(/[/\\:*?"<>|]/g, '-');
      const estNum = String((body && body.estimateNumber) || '').trim().slice(0, 40);
      const folderName = cleanCustomerName + (estNum ? ' — ' + estNum : '') + ' — ' + new Date().toISOString().slice(0, 10);

      const folderId = await ensureFolder(token, rootFolderId, folderName);
      const folderUrl = 'https://drive.google.com/drive/folders/' + folderId;
      sendJson(res, 200, { ok: true, folderId, folderUrl });
      return;
    }

    if (mode === 'doc') {
      const bid = (body && body.bid) || {};
      if (!bid.id) { sendJson(res, 400, { ok: false, error: 'NO_BID' }); return; }

      const cust = bid.customer || {};
      const customerName = String(cust.name || 'Unknown').trim().slice(0, 120);
      const proposalId = String(bid.proposalId || bid.id || '').trim().slice(0, 40);
      const docName = 'Proposal — ' + customerName + (proposalId ? ' #' + proposalId : '') + ' — ' + new Date().toISOString().slice(0, 10);

      // Create or find customer subfolder under root
      const cleanName = customerName.replace(/[/\\:*?"<>|]/g, '-');
      let parentId = rootFolderId;
      try {
        parentId = await ensureFolder(token, rootFolderId, cleanName);
      } catch (_) {
        // Fall back to root if subfolder creation fails
        parentId = rootFolderId;
      }

      const html = proposalHtml(bid);
      const doc = await createGoogleDoc(token, parentId, docName, html);

      const docUrl = 'https://docs.google.com/document/d/' + doc.id + '/edit';
      sendJson(res, 200, { ok: true, docId: doc.id, docUrl });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'BAD_MODE' });
  } catch (e) {
    if (e && e.message === 'DRIVE_AUTH') {
      sendJson(res, 200, { ok: false, error: 'DRIVE_AUTH', detail: e.detail || 'auth_failed' });
      return;
    }
    if (e && e.message === 'DRIVE_ERROR') {
      sendJson(res, 200, { ok: false, error: 'DRIVE_ERROR', detail: e.detail || 'upstream' });
      return;
    }
    sendJson(res, 200, { ok: false, error: 'DRIVE_ERROR', detail: 'unexpected' });
  }
};
