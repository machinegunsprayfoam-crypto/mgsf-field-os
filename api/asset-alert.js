const MAX_BODY_BYTES = 8 * 1024 * 1024;

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

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchSupabaseRows(baseUrl, serviceKey, table) {
  const r = await fetch(baseUrl + '/rest/v1/' + table + '?select=*', {
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json'
    }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error('SUPABASE_ERROR');
    e.detail = typeof data?.message === 'string' ? data.message : ('http_' + r.status);
    throw e;
  }
  return Array.isArray(data) ? data : [];
}

async function postAlert(webhook, payload) {
  const r = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return r.ok;
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST' && req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !String(serviceKey).trim() || !baseUrl || !String(baseUrl).trim()) {
    sendJson(res, 200, { configured: false });
    return;
  }

  let body;
  if (req.method === 'GET') {
    body = {};
  } else {
    try { body = await readBody(req); }
    catch (e) {
      if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
      sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
    }
  }

  const check = body?.check || 'all';
  if (!['all', 'equipment', 'inventory'].includes(check)) {
    sendJson(res, 400, { ok: false, error: 'BAD_CHECK' });
    return;
  }

  const webhook = process.env.ALERTS_WEBHOOK_URL;
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 14);

  try {
    const [equipmentRows, inventoryRows] = await Promise.all([
      check === 'inventory' ? Promise.resolve([]) : fetchSupabaseRows(baseUrl, serviceKey, 'equipment'),
      check === 'equipment' ? Promise.resolve([]) : fetchSupabaseRows(baseUrl, serviceKey, 'inventory_items'),
    ]);

    const equipmentDue = equipmentRows.filter((item) => {
      if (!item?.next_service_date) return false;
      const status = String(item.status || '').toLowerCase();
      if (status === 'out_of_service' || status === 'sold') return false;
      const due = new Date(item.next_service_date);
      return !Number.isNaN(due.getTime()) && due <= cutoff;
    });

    const inventoryLow = inventoryRows.filter((item) => asNumber(item?.quantity_on_hand) <= asNumber(item?.reorder_point));

    const alerts = [];

    for (const item of equipmentDue) {
      alerts.push({
        event: 'equipment_due',
        message: `Equipment service due: ${item.name || 'Unnamed equipment'} — due ${formatDate(new Date(item.next_service_date))}`,
        equipment: item.name || 'Unnamed equipment',
        due_date: formatDate(new Date(item.next_service_date)),
      });
    }

    for (const item of inventoryLow) {
      const qty = asNumber(item.quantity_on_hand);
      const reorderPoint = asNumber(item.reorder_point);
      alerts.push({
        event: 'inventory_low',
        message: `Low stock: ${item.name || 'Unnamed item'} — ${qty} ${item.unit || 'units'} on hand (reorder at ${reorderPoint})`,
        item: item.name || 'Unnamed item',
        qty,
        unit: item.unit || 'units',
      });
    }

    let alertsSent = 0;
    if (webhook && String(webhook).trim()) {
      const results = await Promise.allSettled(alerts.map((payload) => postAlert(webhook, payload)));
      alertsSent = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    }

    sendJson(res, 200, {
      ok: true,
      configured: true,
      equipment_due: equipmentDue.length,
      inventory_low: inventoryLow.length,
      alerts_sent: alertsSent,
    });
  } catch (e) {
    const detail = e && e.detail ? String(e.detail).slice(0, 140) : 'unexpected';
    sendJson(res, 200, { ok: false, configured: true, error: 'ASSET_ALERT_ERROR', detail });
  }
};
