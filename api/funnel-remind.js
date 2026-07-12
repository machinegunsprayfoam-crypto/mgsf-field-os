const WEBHOOK = process.env.ALERTS_WEBHOOK_URL || process.env.NOTIFY_WEBHOOK_URL || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SECRET = process.env.FUNNEL_REMIND_SECRET || '';
const INACTIVE_STATUSES = '(lost,completed,scheduled,won)';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function isAuthorized(header) {
  if (!SECRET) return true;
  const value = String(header || '').trim();
  return value === SECRET || value === 'Bearer ' + SECRET;
}

function leadName(lead) {
  return lead.company_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown lead';
}

function supabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
    accept: 'application/json',
  };
}

async function fetchLeads(params) {
  const url = new URL('/rest/v1/leads', SUPABASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), { headers: supabaseHeaders() });
  if (!response.ok) throw new Error('supabase_' + response.status);
  return response.json();
}

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST' && req.method !== 'GET') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }
  if (req.method === 'POST' && !isAuthorized(req.headers.authorization)) { sendJson(res, 401, { ok: false, error: 'UNAUTHORIZED' }); return; }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { sendJson(res, 200, { configured: false }); return; }

  try {
    const baseParams = {
      select: 'id,first_name,last_name,company_name,status,next_follow_up_at,service_interest,city,state,phone,updated_at,created_at',
      status: 'not.in.' + INACTIVE_STATUSES,
      next_follow_up_at: 'not.is.null',
      order: 'next_follow_up_at.asc',
    };
    const candidates = await fetchLeads(baseParams);
    const stale = await fetchLeads({
      ...baseParams,
      next_follow_up_at: 'lt.' + new Date().toISOString(),
    });

    const staleLeads = Array.isArray(stale) ? stale : [];
    const followUpSuggestions = staleLeads.map(l => ({
      name: leadName(l) || 'Lead',
      phone: l.phone || '',
      daysQuiet: Math.floor((Date.now() - new Date(l.updated_at || l.created_at || l.next_follow_up_at || Date.now())) / 86400000),
      suggestedText: `Hi ${(leadName(l)||'').split(' ')[0]}, just checking in — I sent an estimate ${Math.floor((Date.now() - new Date(l.updated_at||l.created_at||l.next_follow_up_at||Date.now()))/86400000)} days ago. Any questions, or has your timeline shifted? — Clifton, Machine Gun Spray Foam, 406-939-8301`
    }));
    const summaryLines = staleLeads.map((lead) => {
      const daysQuiet = Math.floor((Date.now() - new Date(lead.updated_at || lead.created_at || lead.next_follow_up_at || Date.now())) / 86400000);
      return `${leadName(lead)} — ${daysQuiet} day${daysQuiet === 1 ? '' : 's'} since contact`;
    });

    let alertsSent = 0;
    if (WEBHOOK && staleLeads.length) {
      const payload = {
        event: 'funnel_follow_up_overdue',
        message: 'Lead follow-up overdue\n' + summaryLines.join('\n'),
        staleLeads: staleLeads.map((lead) => ({
          name: leadName(lead),
          phone: lead.phone || '',
          status: lead.status || '',
          service: lead.service_interest || '',
          address: [lead.city, lead.state].filter(Boolean).join(', '),
          next_follow_up_at: lead.next_follow_up_at,
        })),
        followUpSuggestions,
        at: new Date().toISOString(),
      };
      const webhookResponse = await fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (webhookResponse.ok) alertsSent += 1;
    }

    sendJson(res, 200, {
      ok: true,
      checked: Array.isArray(candidates) ? candidates.length : 0,
      stale: Array.isArray(stale) ? stale.length : 0,
      alertsConfigured: Boolean(WEBHOOK),
      alertsSent,
    });
  } catch (error) {
    sendJson(res, 200, { ok: false, error: String(error).slice(0, 160), configured: true });
  }
};
