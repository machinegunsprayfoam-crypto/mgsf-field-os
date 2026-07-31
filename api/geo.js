// Klyfton GEO — turn a job address into real distance + a mobilization quote.
//
// Gap: MGSF works across MT/ND/SD/WY and mobilization pricing depends on how far the
// job is from HQ — but nothing computed that. A human eyeballed the miles and picked a
// tier. This geocodes the address and measures drive distance from HQ, then applies the
// LOCKED mobilization tiers from mgsf-core DOCTRINE (this module READS doctrine pricing,
// it never sets or changes it).
//
// Design (the gated-live pattern):
//   • PURE CORE — mobilization(miles) is deterministic, keyless, fully unit-tested. This
//     is the money math and the genuinely useful part.
//   • GATED LIVE — geocode()/driveMiles() call a maps API only when GOOGLE_MAPS_API_KEY
//     (or MAPS_API_KEY) is set; absent key ⇒ {ok:false, reason:'not_configured'}. Never
//     fabricates a distance.
//   • ADDITIVE — new /api/geo endpoint; nothing else changes.
//
// HQ (public business address): 2402 N Anderson Ave, Glendive MT 59330.
//
// POST { address }            -> geocode + drive miles from HQ + mobilization quote (needs key)
// POST { miles }              -> mobilization quote only (keyless, pure)
// GET                          -> config/status + the locked tiers
// No npm — global fetch only.

const HQ = "2402 N Anderson Ave, Glendive, MT 59330";
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || "";

// --- PURE CORE: mobilization from mgsf-core DOCTRINE (LOCKED — read-only here) ---------
// DOCTRINE: <25 mi $100 · 25–50 mi $200 · 50+ mi $350, plus $1.50/mi past 100 mi.
// If mgsf-core ever changes these, mgsf-core wins — keep this block in sync (and it's
// covered conceptually by tools/doctrine_reconcile.py's mobilization intent).
const MOBIL = { near: 100, mid: 200, far: 350, perMileOver: 1.50, freeUntil: 100 };

function mobilization(milesIn) {
  const miles = Number(milesIn);
  if (!Number.isFinite(miles) || miles < 0) return { ok: false, reason: "bad_miles" };
  let base, tier;
  if (miles < 25) { base = MOBIL.near; tier = "<25 mi"; }
  else if (miles <= 50) { base = MOBIL.mid; tier = "25–50 mi"; }
  else { base = MOBIL.far; tier = "50+ mi"; }
  const over = Math.max(0, miles - MOBIL.freeUntil);
  const surcharge = Math.round(over * MOBIL.perMileOver * 100) / 100;
  return { ok: true, miles: Math.round(miles * 10) / 10, tier, base, surcharge, total: Math.round((base + surcharge) * 100) / 100 };
}

// --- GATED LIVE: geocode + drive distance (Google Maps) --------------------------------

function isConfigured() { return !!MAPS_KEY; }

async function geocode(address) {
  if (!MAPS_KEY) return { ok: false, reason: "not_configured" };
  const url = "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(String(address || "")) + "&key=" + MAPS_KEY;
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (d.status !== "OK" || !d.results || !d.results.length) return { ok: false, reason: "geocode_" + (d.status || "err") };
    const g = d.results[0];
    return { ok: true, formatted: g.formatted_address, lat: g.geometry.location.lat, lng: g.geometry.location.lng };
  } catch (e) { return { ok: false, reason: "error", detail: (e && e.message) || "err" }; }
}

// Drive distance in miles between two addresses (default origin = HQ). Uses Distance Matrix.
async function driveMiles(destination, origin) {
  if (!MAPS_KEY) return { ok: false, reason: "not_configured" };
  const o = origin || HQ;
  const url = "https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial&origins=" +
    encodeURIComponent(o) + "&destinations=" + encodeURIComponent(String(destination || "")) + "&key=" + MAPS_KEY;
  try {
    const r = await fetch(url);
    const d = await r.json();
    const el = d.rows && d.rows[0] && d.rows[0].elements && d.rows[0].elements[0];
    if (!el || el.status !== "OK") return { ok: false, reason: "distance_" + ((el && el.status) || d.status || "err") };
    const miles = el.distance.value / 1609.344; // meters -> miles
    const mins = el.duration.value / 60;
    return { ok: true, miles: Math.round(miles * 10) / 10, driveMinutes: Math.round(mins), from: o, to: destination };
  } catch (e) { return { ok: false, reason: "error", detail: (e && e.message) || "err" }; }
}

// --- HTTP HANDLER ---------------------------------------------------------------------

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, module: "geo", configured: isConfigured(), hq: HQ,
        what: "geocode a job address + drive distance from HQ, then a mobilization quote (locked doctrine tiers)",
        tiers: { "<25mi": MOBIL.near, "25-50mi": MOBIL.mid, "50+mi": MOBIL.far, "per_mile_over_100": MOBIL.perMileOver },
        note: isConfigured() ? "ready" : "set GOOGLE_MAPS_API_KEY (or MAPS_API_KEY) for geocoding/distance; mobilization math works keyless" });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });
    const body = req.body || {};
    // keyless path: caller already knows the miles
    if (body.miles != null && !body.address) {
      return res.status(200).json({ ok: true, mobilization: mobilization(body.miles) });
    }
    if (!body.address) return res.status(400).json({ ok: false, reason: "no_address_or_miles" });
    if (!isConfigured()) return res.status(200).json({ ok: false, reason: "not_configured", need: "GOOGLE_MAPS_API_KEY" });
    const dist = await driveMiles(body.address, body.origin);
    if (!dist.ok) return res.status(200).json(dist);
    return res.status(200).json({ ok: true, ...dist, mobilization: mobilization(dist.miles) });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "error", detail: (e && e.message) || "err" });
  }
};

module.exports.mobilization = mobilization;
module.exports.geocode = geocode;
module.exports.driveMiles = driveMiles;
module.exports.isConfigured = isConfigured;
module.exports._HQ = HQ;
