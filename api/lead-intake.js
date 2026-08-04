// Public website lead intake. Accepts only a bounded lead shape, stores it in the shared pipeline,
// then emits the owner alert server-side. It intentionally does not expose generic sync or notify APIs.
const crypto = require("crypto");
const notify = require("./notify");
function env(re, exclude) { for (const key of Object.keys(process.env)) if ((!exclude || !exclude.test(key)) && re.test(key) && process.env[key]) return process.env[key]; }
const KV_URL = env(/KV_REST_API_URL$/i) || env(/REST_API_URL$/i) || env(/UPSTASH_REDIS_REST_URL$/i);
const KV_TOKEN = env(/KV_REST_API_TOKEN$/i, /READ_ONLY/i) || env(/REST_API_TOKEN$/i, /READ_ONLY/i);
const configured = !!(KV_URL && KV_TOKEN);
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
function validPhone(v) { return /^[0-9+().\-\s]{7,30}$/.test(v); }
async function getLeads() { const r = await fetch(`${KV_URL}/get/${encodeURIComponent("mgsf:leads")}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } }); const j = await r.json(); try { return Array.isArray(JSON.parse(j.result)) ? JSON.parse(j.result) : []; } catch { return []; } }
async function saveLeads(leads) { await fetch(`${KV_URL}/set/${encodeURIComponent("mgsf:leads")}`, { method: "POST", headers: { Authorization: `Bearer ${KV_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(leads.slice(-2000)) }); }
function normalize(input) {
  const lead = { id: crypto.randomUUID(), name: clean(input.name, 100), phone: clean(input.phone, 30), email: clean(input.email, 160), address: clean(input.address, 200), service: clean(input.service, 80), building: clean(input.building, 80), sqft: Math.max(0, Math.min(10000000, Number(input.sqft) || 0)), timeline: clean(input.timeline, 80), notes: clean(input.notes, 2000), status: "New", source: "Web intake", value: 0, date: new Date().toISOString().slice(0, 10) };
  if (!lead.name || !lead.service || !validPhone(lead.phone)) return null;
  return lead;
}
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body; if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body && body.company_hp) { res.status(204).end(); return; }
  const lead = normalize(body || {});
  if (!lead) { res.status(400).json({ error: "invalid_lead" }); return; }
  if (!configured) { res.status(200).json({ configured: false }); return; }
  try { const leads = await getLeads(); leads.push(lead); await saveLeads(leads); await notify.dispatch({ event: "new_lead", lead }); res.status(200).json({ configured: true, accepted: true }); }
  catch { res.status(200).json({ configured: false }); }
};
module.exports.normalize = normalize;
