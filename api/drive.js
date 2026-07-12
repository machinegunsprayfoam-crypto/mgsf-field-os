/**
 * /api/drive.js
 *
 * Google Drive sync utility for MGSF Field OS.
 * Creates a job folder structure under a configured parent folder.
 *
 * Uses native fetch + Node.js crypto to sign service-account JWTs —
 * no npm dependencies required.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — Service account credentials JSON (stringified)
 *   GOOGLE_DRIVE_PARENT_ID       — Parent folder ID in Google Drive
 */

const crypto = require('crypto');

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive';

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

// Build and sign a service-account JWT, then exchange for an OAuth access token.
// Uses only Node.js built-in crypto — no googleapis package needed.
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const signingInput = `${header}.${claimSet}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(credentials.private_key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = (data && (data.error_description || data.error)) ? String(data.error_description || data.error) : ('http_' + r.status);
    const e = new Error('GOOGLE_AUTH_ERROR'); e.detail = detail; throw e;
  }
  return data.access_token;
}

async function drivePost(token, path, body) {
  const r = await fetch(DRIVE_API + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = (data && data.error && data.error.message) ? String(data.error.message) : ('http_' + r.status);
    const e = new Error('DRIVE_ERROR'); e.detail = detail; throw e;
  }
  return data;
}

async function createFolder(token, name, parentId) {
  return drivePost(token, '/files?fields=id,webViewLink', {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId],
  });
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const rawCreds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const parentId = process.env.GOOGLE_DRIVE_PARENT_ID;
  if (!rawCreds || !parentId) {
    sendJson(res, 200, { ok: false, configured: false, error: 'GOOGLE_DRIVE_NOT_CONFIGURED' });
    return;
  }

  let credentials;
  try { credentials = JSON.parse(rawCreds); }
  catch (e) { sendJson(res, 200, { ok: false, error: 'BAD_CREDENTIALS_JSON' }); return; }

  const body = req.body ?? {};
  const { action, project_name, customer_name } = body;

  if (!action) { sendJson(res, 400, { ok: false, error: 'action is required' }); return; }

  if (action === 'create_job_folder') {
    if (!project_name) { sendJson(res, 400, { ok: false, error: 'project_name is required' }); return; }

    try {
      const token = await getAccessToken(credentials);

      // Folder name: YYYY-MM-DD — Customer — Project
      const date = new Date().toISOString().split('T')[0];
      const folderName = [date, customer_name, project_name].filter(Boolean).join(' \u2014 ');

      const jobFolder = await createFolder(token, folderName, parentId);

      // Create standard subfolders in parallel
      const subfolders = [
        '01-Proposal',
        '02-Contract',
        '03-Photos-Before',
        '04-Photos-During',
        '05-Photos-After',
        '06-Closeout',
        '07-Invoice',
      ];
      await Promise.all(subfolders.map((name) => createFolder(token, name, jobFolder.id)));

      sendJson(res, 200, {
        ok: true,
        folder_id: jobFolder.id,
        folder_url: jobFolder.webViewLink,
        folder_name: folderName,
      });
    } catch (e) {
      const detail = e && e.detail ? String(e.detail).slice(0, 200) : String(e).slice(0, 200);
      sendJson(res, 200, { ok: false, error: e.message || 'DRIVE_ERROR', detail });
    }
    return;
  }

  sendJson(res, 400, { ok: false, error: `Unknown action: ${action}` });
};
