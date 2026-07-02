// MGSF lead/estimate sync → Supabase (Vercel Node 18+ serverless function)
// SECURITY: SUPABASE_SERVICE_KEY is read ONLY from process.env and is NEVER echoed.
// POST { bid: { id, customer, state, market, service, scopes, sellPrice, totalCost,
//               status, createdAt, consoleNotes, bf, sf } }
//   → { ok:true, customerId, estimateId }
// If keys missing → { ok:false, error:"SUPABASE_NOT_CONFIGURED" }
// Non-POST → 405. CORS preflight → 204.

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

// Light wrapper around the Supabase REST API (no SDK needed)
function supabaseRequest(baseUrl, serviceKey, method, path, body) {
  return fetch(baseUrl + '/rest/v1' + path, {
    method,
    headers: {
      apikey: serviceKey,
      authorization: 'Bearer ' + serviceKey,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error('SUPABASE_ERROR');
      e.detail = (data && (data.message || data.error)) ? String(data.message || data.error).slice(0, 200) : ('http_' + r.status);
      throw e;
    }
    return data;
  });
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
  if (!sbUrl || !sbKey) {
    sendJson(res, 200, { ok: false, error: 'SUPABASE_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const bid = (body && body.bid) || body;
  if (!bid || !bid.id) { sendJson(res, 400, { ok: false, error: 'NO_BID' }); return; }

  const cust = bid.customer || {};
  const phone = clean(cust.phone, 30);
  const email = clean(cust.email, 160);

  try {
    // 1. Upsert customer (match by phone or email, else create new)
    let customerId = null;

    // Try to find an existing customer by phone or email
    if (phone || email) {
      const filters = [];
      if (phone) filters.push('phone=eq.' + encodeURIComponent(phone));
      if (email) filters.push('email=eq.' + encodeURIComponent(email));
      const existing = await supabaseRequest(sbUrl, sbKey, 'GET',
        '/customers?or=(' + filters.join(',') + ')&limit=1', null);
      if (Array.isArray(existing) && existing.length) {
        customerId = existing[0].id;
        // Update fields that may have changed
        await supabaseRequest(sbUrl, sbKey, 'PATCH',
          '/customers?id=eq.' + customerId, {
            updated_at: new Date().toISOString(),
            first_name: clean(cust.name ? cust.name.split(' ')[0] : '', 100),
            last_name: clean(cust.name ? cust.name.split(' ').slice(1).join(' ') : '', 100),
            phone: phone || undefined,
            email: email || undefined,
            notes: clean(bid.consoleNotes, 2000) || undefined,
            lead_source: clean(bid.market, 80) || undefined
          });
      }
    }

    if (!customerId) {
      // Create new customer
      const nameParts = (cust.name || '').trim().split(' ');
      const rows = await supabaseRequest(sbUrl, sbKey, 'POST', '/customers', {
        customer_type: bid.market === 'commercial' ? 'commercial'
          : bid.market === 'government' ? 'government' : 'residential',
        first_name: clean(nameParts[0], 100),
        last_name: clean(nameParts.slice(1).join(' '), 100),
        phone: phone || null,
        email: email || null,
        lead_source: clean(bid.market, 80) || null,
        notes: clean(bid.consoleNotes, 2000) || null
      });
      customerId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
    }

    if (!customerId) {
      sendJson(res, 200, { ok: false, error: 'SUPABASE_ERROR', detail: 'customer_insert_failed' });
      return;
    }

    // 2. Upsert estimate (keyed on bid.id stored as estimate_number)
    const serviceType = mapServiceType(bid.service || (bid.scopes && bid.scopes[0] && bid.scopes[0].service) || '');
    const sellPrice = Number(bid.sellPrice) || 0;
    const totalCost = Number(bid.totalCost) || 0;
    const sf = Number(bid.sf) || 0;
    const bf = Number(bid.bf) || 0;

    // Check if estimate already exists
    const existingEst = await supabaseRequest(sbUrl, sbKey, 'GET',
      '/estimates?estimate_number=eq.' + encodeURIComponent(bid.id) + '&limit=1', null);

    let estimateId = null;
    const estimatePayload = {
      customer_id: customerId,
      updated_at: new Date().toISOString(),
      status: mapStatus(bid.status),
      service_type: serviceType,
      project_name: clean(cust.name, 200) || null,
      scope_summary: scopeSummary(bid),
      square_feet: sf || null,
      // board_feet is a generated always column in the DB schema (square_feet * thickness_inches) — do not set it directly
      unit_price: sf > 0 ? Math.round((sellPrice / sf) * 100) / 100 : null,
      material_cost: totalCost || null,
      total: sellPrice || null,
      subtotal: sellPrice || null
    };

    if (Array.isArray(existingEst) && existingEst.length) {
      estimateId = existingEst[0].id;
      await supabaseRequest(sbUrl, sbKey, 'PATCH',
        '/estimates?id=eq.' + estimateId, estimatePayload);
    } else {
      estimatePayload.estimate_number = bid.id;
      estimatePayload.created_at = bid.createdAt || new Date().toISOString();
      const estRows = await supabaseRequest(sbUrl, sbKey, 'POST', '/estimates', estimatePayload);
      estimateId = Array.isArray(estRows) && estRows[0] ? estRows[0].id : null;
    }

    // 3. Log line items if scopes provided
    if (estimateId && Array.isArray(bid.scopes) && bid.scopes.length) {
      // Delete existing items and re-insert (simplest upsert for line items)
      await supabaseRequest(sbUrl, sbKey, 'DELETE',
        '/estimate_items?estimate_id=eq.' + estimateId, null).catch(() => {});
      const items = bid.scopes.map((s, i) => ({
        estimate_id: estimateId,
        line_type: 'service',
        description: scopeLineLabel(s),
        quantity: Number(s.sf) || Number(s.bf) || 1,
        unit: s.bf > 0 ? 'bf' : 'sf',
        unit_price: Number(s.unitPrice) || 0,
        sort_order: i
      }));
      await supabaseRequest(sbUrl, sbKey, 'POST', '/estimate_items', items).catch(() => {});
    }

    sendJson(res, 200, { ok: true, customerId, estimateId });
  } catch (e) {
    if (e && e.message === 'SUPABASE_ERROR') {
      sendJson(res, 200, { ok: false, error: 'SUPABASE_ERROR', detail: e.detail || 'upstream' });
      return;
    }
    sendJson(res, 200, { ok: false, error: 'SUPABASE_ERROR', detail: 'unexpected' });
  }
};

function mapServiceType(s) {
  if (!s) return 'closed_cell_spray_foam';
  const m = {
    foam: 'closed_cell_spray_foam', 'closed-cell': 'closed_cell_spray_foam',
    'open-cell': 'open_cell_spray_foam', roof: 'spf_roofing', roofcoat: 'roof_coating',
    concrete: 'concrete_lifting', void: 'void_fill', soil: 'soil_stabilization',
    polyurea: 'polyurea', coatings: 'polyurea'
  };
  const key = String(s).toLowerCase().replace(/[^a-z]/g, '');
  for (const k of Object.keys(m)) { if (key.includes(k.replace(/[^a-z]/g, ''))) return m[k]; }
  return 'closed_cell_spray_foam';
}

function mapStatus(s) {
  if (!s) return 'draft';
  const m = { draft: 'draft', approved: 'approved', sent: 'sent', won: 'won', lost: 'lost' };
  return m[String(s).toLowerCase()] || 'draft';
}

function scopeSummary(bid) {
  if (Array.isArray(bid.scopes) && bid.scopes.length) {
    return bid.scopes.map(s => scopeLineLabel(s)).join('; ').slice(0, 1000);
  }
  return clean(bid.service, 500) || null;
}

function scopeLineLabel(s) {
  const svc = s.service || '';
  const zone = s.zone ? ' — ' + s.zone : '';
  const product = s.product ? ' (' + s.product + ')' : '';
  const qty = s.sf ? s.sf + ' sf' : (s.bf ? s.bf + ' bf' : '');
  return (svc + zone + product + (qty ? ' · ' + qty : '')).trim();
}
