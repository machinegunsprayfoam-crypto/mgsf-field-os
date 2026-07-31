// Klyfton LEAD SCORING — deterministic, keyless lead prioritization.
//
// The one genuinely-unbuilt v2 idea (PROJECT_MEMORY): a score so the crew calls the
// best leads first. `hubspot-sync.js` already reads `lead.score >= 75` — nothing computed
// it until now. This fills that gap.
//
// IMPORTANT (doctrine): this is a *heuristic PRIORITY* score, not a probability, not a
// promise about the customer. It's fully transparent — every point is explained in
// `reasons[]` — and it fabricates nothing: it only reads fields the lead actually carries
// (state, phone, email, service, source, message, status). No key, no network, no npm.
//
// POST { lead:{...} }  (or the lead fields at top level)  -> { ok, score, band, reasons }
// GET                                                      -> what it scores + weights
//
// Bands: hot >=75 (call now) · warm 55-74 · cool 35-54 · cold <35.

// MGSF service territory (doctrine mgsf-core state multipliers) and real service lines.
const TERRITORY = ["MT", "ND", "SD", "WY"];
const SERVICES = [
  "spray foam", "insulation", "spf", "roof", "concrete", "lifting", "leveling", "void",
  "polyurea", "coating", "soil", "seawall", "blower door", "crawl", "attic", "metal building",
  "pole barn", "flash and batt", "flash-and-batt",
];
const DEAD = /won|lost|unqualif|closed|dead|complete|cancel|not interested/i;

function s(v) { return String(v == null ? "" : v).trim(); }
function digits(v) { return s(v).replace(/[^0-9]/g, ""); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function stateOf(lead) {
  const st = s(lead.state).toUpperCase();
  if (st) return st.slice(0, 2);
  // try to sniff a 2-letter state out of a city/address string
  const hay = (s(lead.city) + " " + s(lead.address)).toUpperCase();
  for (const t of TERRITORY) if (new RegExp("\\b" + t + "\\b").test(hay)) return t;
  return "";
}

function sourceScore(src) {
  const x = s(src).toLowerCase();
  if (!x) return { d: 0, why: "" };
  if (/refer|word of mouth|repeat|past customer/.test(x)) return { d: 12, why: "referral/repeat source" };
  if (/google|organic|search|website|web|seo|gbp|maps/.test(x)) return { d: 6, why: "organic/website source" };
  if (/direct|phone|call|walk/.test(x)) return { d: 4, why: "direct contact" };
  if (/ad|ppc|paid|facebook|meta|instagram|boost/.test(x)) return { d: 2, why: "paid source" };
  if (/cold|purchas|list|scrape/.test(x)) return { d: -5, why: "cold/purchased source" };
  return { d: 0, why: "" };
}

function serviceMatch(svc) {
  const x = s(svc).toLowerCase();
  if (!x) return "";
  return SERVICES.find((k) => x.indexOf(k) >= 0) || "";
}

// Pure, deterministic. Returns { score, band, reasons:[{signal,delta}], version }.
function score(leadIn) {
  const lead = leadIn && typeof leadIn === "object" ? leadIn : {};
  const reasons = [];
  let pts = 50; // neutral baseline
  const add = (delta, signal) => { if (delta) { pts += delta; reasons.push({ signal, delta }); } };

  // territory
  const st = stateOf(lead);
  if (st && TERRITORY.indexOf(st) >= 0) add(20, "in service territory (" + st + ")");
  else if (st) add(-25, "outside MT/ND/SD/WY service area (" + st + ")");

  // reachability
  const ph = digits(lead.phone);
  if (ph.length >= 10) add(12, "reachable phone");
  else add(-10, "no callable phone");
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s(lead.email))) add(5, "valid email");

  // intent / fit
  const svc = serviceMatch(lead.service || lead.message || lead.notes);
  if (svc) add(10, "known service line (" + svc + ")");
  const msg = s(lead.message || lead.notes);
  if (msg.length >= 20) add(6, "described the job");
  if (s(lead.city) || s(lead.address)) add(4, "location given");

  // source quality (heuristic)
  const src = sourceScore(lead.source);
  if (src.d) add(src.d, src.why);

  // dead statuses cap the score low regardless
  if (DEAD.test(s(lead.status))) {
    const capped = Math.min(pts, 10);
    reasons.push({ signal: "status marked " + s(lead.status), delta: capped - pts });
    pts = capped;
  }

  pts = clamp(Math.round(pts), 0, 100);
  const band = pts >= 75 ? "hot" : pts >= 55 ? "warm" : pts >= 35 ? "cool" : "cold";
  return { score: pts, band, reasons, version: 1 };
}

// --- HTTP HANDLER (keyless; computes directly) ----------------------------------

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ ok: true, module: "lead-score",
        what: "deterministic heuristic PRIORITY score (0-100) so the crew calls the best leads first — not a probability/promise",
        reads: ["state", "phone", "email", "service", "message", "source", "city/address", "status"],
        bands: { hot: ">=75 call now", warm: "55-74", cool: "35-54", cold: "<35" } });
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, reason: "method" });
    const body = req.body || {};
    const lead = body.lead && typeof body.lead === "object" ? body.lead : body;
    const r = score(lead);
    return res.status(200).json({ ok: true, ...r });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "error", detail: (e && e.message) || "err" });
  }
};

module.exports.score = score;
module.exports._TERRITORY = TERRITORY;
