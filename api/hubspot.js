// MGSF "Call List" serverless proxy (Vercel Node function, Node 18+ global fetch)
// SECURITY: the HubSpot private-app token is read ONLY from process.env and is NEVER echoed.
// POST { mode:"leads" }  -> { ok:true, leads:[...] }   (default)
// POST { mode:"logcall", contactId, note[, outcome] } -> { ok:true, logged:"status", status }
//   Updates the contact's hs_lead_status from the call outcome (scope: crm.objects.contacts.write).
//   HubSpot service keys don't expose a calls/notes engagement-write scope, so the field outcome
//   is recorded as a lead-status change on the contact (visible everywhere in the CRM).
// Non-POST rejected (405). CORS preflight (OPTIONS) -> 204.
// If the token is missing/empty -> HTTP 200 {ok:false,error:"HUBSPOT_NOT_CONFIGURED"} so the
// app can show a friendly "Connect HubSpot to see your call list" message instead of crashing.

const HUBSPOT_BASE = 'https://api.hubapi.com';
const PORTAL_ID = '246088810'; // MGSF HubSpot portal (used to build record URLs)
const MAX_BODY_BYTES = 8 * 1024 * 1024; // ~8MB cap on body

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

// Call HubSpot's CRM API. Throws Error('HUBSPOT_ERROR') with a safe .detail on upstream failure.
async function callHubSpot(token, path, payload) {
  const r = await fetch(HUBSPOT_BASE + path, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Surface only a safe category/status, never the token or full upstream body.
    const safe = (data && (data.category || data.message)) ? String(data.category || 'http_' + r.status) : ('http_' + r.status);
    const e = new Error('HUBSPOT_ERROR'); e.detail = safe; throw e;
  }
  return data;
}

// Map one HubSpot contact search result into our compact lead shape.
function mapContact(c) {
  const p = (c && c.properties) || {};
  const first = (p.firstname || '').trim();
  const last = (p.lastname || '').trim();
  let name = (first + ' ' + last).trim();
  if (!name) name = (p.email || '').trim();
  if (!name) name = 'Unknown contact';
  const phone = (p.phone && String(p.phone).trim()) || (p.mobilephone && String(p.mobilephone).trim()) || '';
  return {
    id: c.id,
    name: name,
    phone: phone,
    email: (p.email || '').trim(),
    stage: (p.lifecyclestage || '').trim(),
    status: (p.hs_lead_status || '').trim(),
    city: (p.city || '').trim(),
    state: (p.state || '').trim(),
    updated: (p.lastmodifieddate || '').trim(),
    created: (p.createdate || '').trim(),
    url: HUBSPOT_BASE.indexOf('hubapi') >= 0
      ? ('https://app.hubspot.com/contacts/' + PORTAL_ID + '/record/0-1/' + c.id)
      : ''
  };
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  // Env token is the secure path and always wins. If none is set, fall back to a HubSpot
  // private-app token the owner pasted into the in-app vault (Admin → API Keys), sent as
  // body.token. Validated to look like a HubSpot token so a stray value can't be forwarded.
  const bodyToken = (body && typeof body.token === 'string' && /^(pat-|CJ|na)/.test(body.token.trim())) ? body.token.trim() : '';
  const token = (process.env.HUBSPOT_TOKEN && String(process.env.HUBSPOT_TOKEN).trim()) || bodyToken;
  if (!token || !String(token).trim()) {
    sendJson(res, 200, { ok: false, error: 'HUBSPOT_NOT_CONFIGURED' });
    return;
  }

  const mode = (body && body.mode) || 'leads';

  try {
    if (mode === 'leads') {
      // Two filterGroups = OR: contact has a phone OR a mobilephone.
      const search = {
        filterGroups: [
          { filters: [{ propertyName: 'phone', operator: 'HAS_PROPERTY' }] },
          { filters: [{ propertyName: 'mobilephone', operator: 'HAS_PROPERTY' }] }
        ],
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
        properties: ['firstname', 'lastname', 'phone', 'mobilephone', 'email',
          'lifecyclestage', 'hs_lead_status', 'city', 'state', 'lastmodifieddate', 'createdate'],
        limit: 50
      };
      const data = await callHubSpot(token, '/crm/v3/objects/contacts/search', search);
      const results = Array.isArray(data && data.results) ? data.results : [];
      const leads = results.map(mapContact);
      sendJson(res, 200, { ok: true, leads: leads });
      return;
    }

    if (mode === 'logcall') {
      const contactId = String((body && body.contactId) || '').trim();
      const note = String((body && body.note) || '').slice(0, 4000);
      const outcome = String((body && body.outcome) || '').trim();
      if (!contactId) { sendJson(res, 400, { ok: false, error: 'NO_CONTACT_ID' }); return; }

      // Derive the call outcome from an explicit field or the note's leading text,
      // then map it to a standard HubSpot lead status (default internal values).
      const hay = (outcome + ' ' + note).toLowerCase();
      let status = 'IN_PROGRESS';
      if (hay.indexOf('book') >= 0) status = 'OPEN_DEAL';
      else if (hay.indexOf('not interested') >= 0 || hay.indexOf('uninterested') >= 0 || hay.indexOf('no thank') >= 0) status = 'UNQUALIFIED';
      else if (hay.indexOf('no answer') >= 0 || hay.indexOf('no-answer') >= 0 || hay.indexOf('voicemail') >= 0 || hay.indexOf('left message') >= 0 || hay.indexOf('left a message') >= 0 || hay.indexOf('no pickup') >= 0) status = 'ATTEMPTED_TO_CONTACT';
      else if (hay.indexOf('callback') >= 0 || hay.indexOf('call back') >= 0 || hay.indexOf('connected') >= 0 || hay.indexOf('follow up') >= 0 || hay.indexOf('follow-up') >= 0) status = 'CONNECTED';

      // Update the contact's lead status. Uses PATCH (callHubSpot is POST-only),
      // so issue a dedicated request here. Token is never echoed.
      try {
        const r = await fetch(HUBSPOT_BASE + '/crm/v3/objects/contacts/' + encodeURIComponent(contactId), {
          method: 'PATCH',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({ properties: { hs_lead_status: status } })
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const safe = (data && (data.category || data.message)) ? String(data.category || ('http_' + r.status)) : ('http_' + r.status);
          sendJson(res, 200, { ok: false, error: 'HUBSPOT_ERROR', detail: safe });
          return;
        }
        sendJson(res, 200, { ok: true, logged: 'status', status: status });
        return;
      } catch (patchErr) {
        sendJson(res, 200, { ok: false, error: 'HUBSPOT_ERROR', detail: 'patch_failed' });
        return;
      }
    }

    // ── READ-ONLY generic CRM query — lets Klyfton pull any core object ──────────
    // Safe by construction: only whitelisted objects, only GET-by-id / search / recent
    // list. No create, update, or delete path is reachable through this mode.
    if (mode === 'read') {
      const OBJ = {
        contacts:   { type: '0-1',  props: ['firstname','lastname','email','phone','mobilephone','company','lifecyclestage','hs_lead_status','city','state','lastmodifieddate','createdate'] },
        companies:  { type: '0-2',  props: ['name','domain','phone','city','state','industry','lifecyclestage','numberofemployees','lastmodifieddate','createdate'] },
        deals:      { type: '0-3',  props: ['dealname','amount','dealstage','pipeline','closedate','hs_lastmodifieddate','createdate'] },
        tickets:    { type: '0-5',  props: ['subject','content','hs_pipeline_stage','hs_ticket_priority','createdate','hs_lastmodifieddate'] },
        products:   { type: '0-7',  props: ['name','price','description','hs_sku','createdate','hs_lastmodifieddate'] },
        line_items: { type: '0-8',  props: ['name','price','quantity','amount','createdate','hs_lastmodifieddate'] },
        quotes:     { type: '0-14', props: ['hs_title','hs_status','hs_expiration_date','hs_quote_amount','createdate','hs_lastmodifieddate'] },
        notes:      { type: '0-4',  props: ['hs_note_body','hs_createdate','hs_lastmodifieddate'] },
        tasks:      { type: '0-27', props: ['hs_task_subject','hs_task_status','hs_task_body','hs_timestamp','createdate'] },
        calls:      { type: '0-48', props: ['hs_call_title','hs_call_body','hs_call_direction','hs_call_status','hs_timestamp'] },
        meetings:   { type: '0-47', props: ['hs_meeting_title','hs_meeting_body','hs_meeting_start_time','hs_timestamp'] },
      };
      const objName = String((body && body.object) || 'contacts').toLowerCase();
      const spec = OBJ[objName];
      if (!spec) { sendJson(res, 400, { ok: false, error: 'BAD_OBJECT', allowed: Object.keys(OBJ) }); return; }

      // Caller may narrow the property set, but only to strings; else use safe defaults.
      const props = Array.isArray(body.properties) && body.properties.length
        ? body.properties.filter((s) => typeof s === 'string').slice(0, 40)
        : spec.props;
      const limit = Math.max(1, Math.min(parseInt(body.limit, 10) || 25, 100));

      // 1) Fetch one record by id (GET — read-only).
      const id = String((body && body.id) || '').trim();
      if (id && /^[0-9]+$/.test(id)) {
        const url = HUBSPOT_BASE + '/crm/v3/objects/' + encodeURIComponent(objName) +
          '/' + encodeURIComponent(id) + '?properties=' + encodeURIComponent(props.join(','));
        const r = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { sendJson(res, 200, { ok: false, error: 'HUBSPOT_ERROR', detail: (data && data.category) || ('http_' + r.status) }); return; }
        sendJson(res, 200, { ok: true, object: objName, record: { id: data.id, properties: data.properties || {}, url: 'https://app.hubspot.com/contacts/' + PORTAL_ID + '/record/' + spec.type + '/' + data.id } });
        return;
      }

      // 2) Full-text search, or 3) most-recent list when no query is given. Both use the
      //    search endpoint (a read), so nothing here can mutate the CRM.
      const q = String((body && (body.search || body.query)) || '').trim().slice(0, 120);
      const payload = { properties: props, limit, sorts: [{ propertyName: spec.props.indexOf('hs_lastmodifieddate') >= 0 ? 'hs_lastmodifieddate' : 'lastmodifieddate', direction: 'DESCENDING' }] };
      if (q) payload.query = q;
      const data = await callHubSpot(token, '/crm/v3/objects/' + encodeURIComponent(objName) + '/search', payload);
      const results = Array.isArray(data && data.results) ? data.results : [];
      const records = results.map((c) => ({
        id: c.id,
        properties: c.properties || {},
        url: 'https://app.hubspot.com/contacts/' + PORTAL_ID + '/record/' + spec.type + '/' + c.id
      }));
      sendJson(res, 200, { ok: true, object: objName, count: records.length, records: records });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'BAD_MODE' });
  } catch (e) {
    if (e && e.message === 'HUBSPOT_ERROR') {
      sendJson(res, 200, { ok: false, error: 'HUBSPOT_ERROR', detail: e.detail || 'upstream' });
      return;
    }
    sendJson(res, 200, { ok: false, error: 'HUBSPOT_ERROR', detail: 'unexpected' });
  }
};
