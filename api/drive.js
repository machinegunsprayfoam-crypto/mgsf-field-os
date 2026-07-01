// MGSF Google Drive proxy (Vercel Node function, Node 18+ built-in crypto + global fetch)
// Creates job folders in Google Drive using a service account JWT.
// SECURITY: the service account private key is read ONLY from process.env and is NEVER echoed.
// POST { mode:"create_folder", jobName }  -> { ok, folderId, folderUrl, name }
// POST { mode:"list_folders" }            -> { ok, folders:[...] }
// Non-POST rejected (405). CORS preflight (OPTIONS) -> 204.
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — raw JSON or base64-encoded service account key file
//   GOOGLE_DRIVE_ROOT_FOLDER_ID  — ID of the parent Drive folder where job folders are created
// If env vars are missing -> HTTP 200 { ok:false, error:"DRIVE_NOT_CONFIGURED" }.

const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
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

// Base64url encode without padding.
function b64url(buf) {
  return (Buffer.isBuffer(buf) ? buf : Buffer.from(typeof buf === 'string' ? buf : JSON.stringify(buf)))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Exchange a service-account JSON for a Drive access token using a signed JWT.
async function getAccessToken(sa) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: DRIVE_SCOPE,
    aud: OAUTH_URL,
    exp: now + 3600,
    iat: now,
  }));

  const sigInput = header + '.' + payload;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(sigInput, 'utf8');
  sign.end();
  const sig = b64url(sign.sign(sa.private_key));
  const jwt = sigInput + '.' + sig;

  const r = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(jwt),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) {
    const e = new Error('DRIVE_AUTH_ERROR');
    e.detail = (data && data.error_description) ? String(data.error_description).slice(0, 200) : (data.error || 'token_exchange_failed');
    throw e;
  }
  return data.access_token;
}

// Create a single folder in Drive; returns the created file object.
async function createFolder(token, name, parentId) {
  const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) meta.parents = [parentId];
  const r = await fetch(DRIVE_API + '/files', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(meta),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const safe = (data && data.error && data.error.message)
      ? String(data.error.message).slice(0, 200)
      : 'http_' + r.status;
    const e = new Error('DRIVE_ERROR'); e.detail = safe; throw e;
  }
  return data;
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saRaw || !saRaw.trim()) {
    sendJson(res, 200, { ok: false, error: 'DRIVE_NOT_CONFIGURED' });
    return;
  }

  // Parse service account — accepts raw JSON or base64-encoded JSON.
  let sa;
  try {
    const raw = saRaw.trim().startsWith('{')
      ? saRaw
      : Buffer.from(saRaw, 'base64').toString('utf8');
    sa = JSON.parse(raw);
    if (!sa.client_email || !sa.private_key) throw new Error('missing fields');
  } catch (e) {
    sendJson(res, 200, { ok: false, error: 'DRIVE_BAD_CREDENTIALS' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const mode = (body && body.mode) || 'create_folder';
  const rootId = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim();

  try {
    const token = await getAccessToken(sa);

    // ── CREATE JOB FOLDER ─────────────────────────────────────────────────
    if (mode === 'create_folder') {
      const rawName = String(body.jobName || 'New Job').replace(/[<>:"/\\|?*\x00-\x1f']/g, '-').replace(/-+/g, '-').trim().slice(0, 200);
      const parentId = (body.parentFolderId || rootId) || undefined;

      const folder = await createFolder(token, rawName, parentId);

      // Create standard subfolders (non-fatal if any fail).
      const subfolders = ['Before Photos', 'During Photos', 'After Photos', 'Documents'];
      await Promise.all(
        subfolders.map(sf => createFolder(token, sf, folder.id).catch(() => null))
      );

      const folderUrl = 'https://drive.google.com/drive/folders/' + folder.id;
      sendJson(res, 200, { ok: true, folderId: folder.id, folderUrl, name: folder.name });
      return;
    }

    // ── LIST FOLDERS ──────────────────────────────────────────────────────
    if (mode === 'list_folders') {
      const parentIdRaw = (body.parentFolderId || rootId) || null;
      // Drive folder IDs are alphanumeric + hyphen + underscore only; strip anything else.
      const parentId = parentIdRaw ? parentIdRaw.replace(/[^A-Za-z0-9_-]/g, '') : null;
      let q = "mimeType='application/vnd.google-apps.folder' and trashed=false";
      if (parentId) {
        q += " and '" + parentId + "' in parents";
      }
      const url = DRIVE_API + '/files?q=' + encodeURIComponent(q)
        + '&orderBy=name&fields=files(id,name,webViewLink,createdTime)&pageSize=100';
      const r = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        sendJson(res, 200, { ok: false, error: 'DRIVE_ERROR', detail: 'list_failed' });
        return;
      }
      sendJson(res, 200, { ok: true, folders: data.files || [] });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'BAD_MODE' });

  } catch (e) {
    if (e && (e.message === 'DRIVE_AUTH_ERROR' || e.message === 'DRIVE_ERROR')) {
      sendJson(res, 200, { ok: false, error: e.message, detail: e.detail || 'upstream' });
      return;
    }
    sendJson(res, 200, { ok: false, error: 'DRIVE_ERROR', detail: 'unexpected' });
  }
};
