// MGSF Lead Intake proxy (Vercel Node function, Node 18+ global fetch)
// SECURITY: Supabase service key is read ONLY from process.env and is NEVER echoed.
// POST { mode:"save", firstName, lastName, phone, email, ... }  -> { ok, customerId, estimateId }
// POST { mode:"list" }                                           -> { ok, leads:[...] }
// POST { mode:"status", estimateId, status }                     -> { ok }
// POST { mode:"counts" }                                         -> { ok, counts:{...} }
// Non-POST rejected (405). CORS preflight (OPTIONS) -> 204.
// If keys are missing -> HTTP 200 { ok:false, error:"SUPABASE_NOT_CONFIGURED" }.

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

// Call Supabase REST API. Throws Error('SUPABASE_ERROR') with .detail on failure.
async function sbFetch(url, serviceKey, method, body) {
  const opts = {
    method,
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
    }
  };
  if (method === 'POST' || method === 'PATCH') {
    opts.headers['Prefer'] = 'return=representation';
  }
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('SUPABASE_ERROR');
    e.detail = (data && (data.message || data.error)) ? String(data.message || data.error) : 'http_' + r.status;
    throw e;
  }
  return data;
}

function clean(s, max) {
  return String(s == null ? '' : s).trim().slice(0, max || 500);
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey || !sbUrl.trim() || !sbKey.trim()) {
    sendJson(res, 200, { ok: false, error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const mode = (body && body.mode) || 'save';
  const base = sbUrl.replace(/\/$/, '') + '/rest/v1';

  try {
    // ── SAVE LEAD ───────────────────────────────────────────────────────────
    if (mode === 'save') {
      // 1. Create customer record
      const custPayload = {
        customer_type: clean(body.customerType || 'residential', 50),
        first_name: clean(body.firstName, 80),
        last_name: clean(body.lastName, 80),
        company_name: clean(body.companyName, 120),
        phone: clean(body.phone, 30),
        email: clean(body.email, 160),
        lead_source: clean(body.leadSource || 'manual', 80),
        notes: clean(body.notes, 2000),
      };
      const custRows = await sbFetch(base + '/customers', sbKey, 'POST', custPayload);
      const customerId = Array.isArray(custRows) ? custRows[0].id : custRows.id;

      // 2. Create property record if address provided
      let propertyId = null;
      if (body.street || body.city) {
        const propPayload = {
          customer_id: customerId,
          property_type: clean(body.customerType || 'residential', 50),
          street: clean(body.street, 200),
          city: clean(body.city, 100),
          state: clean(body.state, 50),
          postal_code: clean(body.zip, 20),
          access_notes: clean(body.accessNotes, 500),
        };
        const propRows = await sbFetch(base + '/properties', sbKey, 'POST', propPayload);
        propertyId = Array.isArray(propRows) ? propRows[0].id : propRows.id;
      }

      // 3. Create estimate record (estimate IS the lead at this stage)
      const sf = parseFloat(body.squareFeet) || 0;
      const thick = parseFloat(body.thicknessInches) || 0;
      const estPayload = {
        customer_id: customerId,
        property_id: propertyId,
        status: 'draft',
        service_type: clean(body.serviceType || 'spray_foam_insulation', 80),
        project_name: clean(body.projectName ||
          [body.serviceType, body.city].filter(Boolean).join(' — ') ||
          'New Lead', 200),
        scope_summary: clean(body.scopeSummary || body.description, 2000),
        square_feet: sf,
        thickness_inches: thick,
        measurement_notes: clean(body.accessNotes, 500),
      };
      const estRows = await sbFetch(base + '/estimates', sbKey, 'POST', estPayload);
      const estimateId = Array.isArray(estRows) ? estRows[0].id : estRows.id;

      sendJson(res, 200, { ok: true, customerId, propertyId, estimateId });
      return;
    }

    // ── LIST LEADS ──────────────────────────────────────────────────────────
    if (mode === 'list') {
      const data = await sbFetch(
        base + '/estimates?select=id,created_at,status,service_type,project_name,square_feet,customers(first_name,last_name,company_name,phone,email)&order=created_at.desc&limit=50',
        sbKey, 'GET'
      );
      sendJson(res, 200, { ok: true, leads: Array.isArray(data) ? data : [] });
      return;
    }

    // ── UPDATE STATUS ────────────────────────────────────────────────────────
    if (mode === 'status') {
      const { estimateId, status } = body;
      if (!estimateId || !status) { sendJson(res, 400, { ok: false, error: 'MISSING_FIELDS' }); return; }
      const allowed = ['draft', 'sent', 'approved', 'won', 'lost', 'in_progress', 'complete'];
      if (!allowed.includes(status)) { sendJson(res, 400, { ok: false, error: 'BAD_STATUS' }); return; }
      await sbFetch(
        base + '/estimates?id=eq.' + encodeURIComponent(clean(estimateId, 100)),
        sbKey, 'PATCH', { status, updated_at: new Date().toISOString() }
      );
      sendJson(res, 200, { ok: true });
      return;
    }

    // ── DASHBOARD COUNTS ────────────────────────────────────────────────────
    if (mode === 'counts') {
      const [custData, estData] = await Promise.all([
        sbFetch(base + '/customers?select=id&limit=1000', sbKey, 'GET').catch(() => []),
        sbFetch(base + '/estimates?select=id,status&limit=1000', sbKey, 'GET').catch(() => []),
      ]);
      const ests = Array.isArray(estData) ? estData : [];
      const counts = {
        customers: Array.isArray(custData) ? custData.length : 0,
        total_leads: ests.length,
        draft: ests.filter(e => e.status === 'draft').length,
        sent: ests.filter(e => e.status === 'sent').length,
        approved: ests.filter(e => e.status === 'approved').length,
        won: ests.filter(e => e.status === 'won').length,
      };
      sendJson(res, 200, { ok: true, counts });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'BAD_MODE' });

  } catch (e) {
    if (e && e.message === 'SUPABASE_ERROR') {
      sendJson(res, 200, { ok: false, error: 'SUPABASE_ERROR', detail: e.detail || 'upstream' });
      return;
    }
    sendJson(res, 200, { ok: false, error: 'SUPABASE_ERROR', detail: 'unexpected' });
  }
};
