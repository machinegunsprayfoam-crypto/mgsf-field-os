// THE CUBE'S CAPABILITY ALGEBRA — every combination of the 6-division council, enumerated.
//
// A Rubik's cube has exactly 26 outer pieces: 6 face-centers + 12 edges + 8 corners. Map the 6
// divisions onto the 6 faces (arranged as 3 opposite-face AXES) and every piece becomes a real
// capability:
//   • face   (1 division)  → that division and its specialists
//   • edge   (2 divisions) → a 2-division cross-functional team (they share a cube edge)
//   • corner (3 divisions) → a 3-division team (one division from each axis; they meet at a vertex)
// Opposite faces never share a piece — those pairs are the business TENSIONS (below).
//
// FEATURED plays are hand-tuned (curated name + team + a trigger regex for the router fast-path).
// Every other overlap gets an AUTO-GENERATED "suggested" capability (the lead of each division) so
// NO combination is ever undefined — the whole cube is covered, with room to promote a suggestion
// to a featured play when it earns it. Pure, keyless, deterministic (no Date.now / Math.random).
//
// GET /api/combos -> the full enumerated cube (faces/edges/corners) + the 3 axes/tensions.

// The 6 divisions (the cube faces). `lead` = the division's CENTER piece — its captain/first mind.
// members[] MUST match the division grouping of SPECIALISTS in api/klyfton.js (guarded by tests/combos.js).
const DIVISIONS = [
  { key: "est",    name: "Estimating & Takeoff", color: "#ffb020", lead: "estimator",
    members: ["estimator", "takeoff_spf", "takeoff_lift", "takeoff_roof", "photo_bid", "value_eng"] },
  { key: "field",  name: "Field & Production", color: "#35e0c8", lead: "building",
    members: ["building", "concrete", "roofing", "safety", "equipment", "quality", "scheduling"] },
  { key: "growth", name: "Sales & Growth", color: "#ff7a2f", lead: "lead_hunter",
    members: ["marketing", "lead_hunter", "proposal", "customer_comms", "reviews", "appointment"] },
  { key: "money",  name: "Finance & Admin", color: "#4ccf70", lead: "finance",
    members: ["finance", "ar_collections", "cashflow", "payroll", "bookkeeping"] },
  { key: "risk",   name: "Compliance & Risk", color: "#ff5a52", lead: "code",
    members: ["code", "insurance", "contracts", "licensing", "warranty"] },
  { key: "gov",    name: "GovCon & Strategy", color: "#9b8cff", lead: "govcon",
    members: ["govcon", "capability", "teaming", "pm", "strategy"] },
];

// The 3 AXES = opposite face pairs. Divisions on opposite faces never share a piece — so these are
// the pairs the cube deliberately holds in TENSION (the two ends you balance, never merge).
const AXES = [
  { a: "est",  b: "gov",    tension: "Win commercial work ↔ win government work" },
  { a: "field", b: "money", tension: "Do the work ↔ account for the work" },
  { a: "risk", b: "growth", tension: "Compliance & caution ↔ sales & expansion" },
];

// Featured cross-functional plays — hand-tuned teams with a router trigger. Ordered corners-first so
// the most complete team wins a tie in the fast-path.
const FEATURED = [
  { key: "go_no_go", name: "Go/No-Go Bid", divisions: ["est", "money", "risk"], members: ["estimator", "finance", "code"],
    play: "Should we bid? Priced, code-compliant, and worth the effort — decided in one call.",
    re: /\b(should\s+(we|i)\s+bid|go[\s/-]?no[\s/-]?go|worth\s+(bidding|the\s+bid)|take\s+(this|the)\s+job)\b/i },
  { key: "federal_package", name: "Federal Bid Package", divisions: ["gov", "money", "risk"], members: ["govcon", "finance", "insurance"],
    play: "A bondable, priced, compliant federal bid package — the whole thing, one pass.",
    re: /\b(federal|sam\.?gov|govcon|sdvosb|solicitation)\b[\s\S]{0,50}\b(bond|bonding|insurance|proposal|price|pricing)\b/i },
  { key: "win_rate", name: "Win-Rate Play", divisions: ["est", "money", "growth"], members: ["estimator", "finance", "proposal"],
    play: "Priced-right proposals that actually close — the estimate, the margin, and the pitch tuned together.",
    re: /\b(win\s?rate|close\s?rate|hit\s?rate|closing\s+more|why\s+are\s+we\s+losing)\b[\s\S]{0,50}\b(bid|quote|proposal|margin|price|job)\b/i },
  { key: "priced_margin", name: "Priced-to-Margin Bid", divisions: ["est", "money"], members: ["estimator", "finance"],
    play: "Every bid checked against the doctrine margin target before it goes out.",
    re: /\b(bid|quote|estimate|price)\b[\s\S]{0,40}\b(margin|profit|markup|make money)\b|\b(margin|profit|markup)\b[\s\S]{0,40}\b(bid|quote|estimate)\b/i },
  { key: "code_bid", name: "Code-Compliant Bid", divisions: ["est", "risk"], members: ["estimator", "code"],
    play: "A bid that already meets the R-value and permit requirements.",
    re: /\b(bid|quote|estimate|spec)\b[\s\S]{0,40}\b(code|r-?value|permit|compliance)\b|\b(code|r-?value|permit)\b[\s\S]{0,40}\b(bid|quote|estimate)\b/i },
  { key: "quote_proposal", name: "Quote → Proposal", divisions: ["est", "growth"], members: ["estimator", "proposal"],
    play: "Turn the estimate numbers straight into a sent, professional proposal.",
    re: /\b(turn|make|write|build|draft|generate)\b[\s\S]{0,30}\bproposal\b/i },
  { key: "govcon_price", name: "GovCon Pricing", divisions: ["gov", "money"], members: ["govcon", "finance"],
    play: "Price a federal bid to win — and still hit margin.",
    re: /\b(price|cost|bid)\b[\s\S]{0,40}\b(federal|government|sam\.?gov|govcon)\b/i },
  { key: "bonded_job", name: "Bonded & Insured Job", divisions: ["money", "risk"], members: ["insurance", "finance"],
    play: "A job costed with the bonding and insurance built in, not bolted on.",
    re: /\b(bond|bonding|insurance|coi)\b[\s\S]{0,40}\b(job|bid|cost|require|need)\b/i },
  { key: "safe_legal", name: "Safe & Legal Install", divisions: ["field", "risk"], members: ["safety", "code"],
    play: "An install plan that's OSHA-clean and code-legal from the start.",
    re: /\b(install|spray|application|job)\b[\s\S]{0,50}\b(osha|safe|safety)\b[\s\S]{0,50}\b(code|permit)\b/i },
  { key: "deposit_close", name: "Deposit-to-Close", divisions: ["growth", "money"], members: ["customer_comms", "cashflow"],
    play: "Close the sale with a deposit and a payment plan that keeps cash positive.",
    re: /\b(payment\s*plan|deposit|financing|milestone)\b[\s\S]{0,40}\b(close|customer|proposal|collect)\b/i },
  { key: "true_profit", name: "True Job Profit", divisions: ["field", "money"], members: ["finance", "quality"],
    play: "Planned vs. actual — the real profit on the job after the field logs the actuals.",
    re: /\b(true|actual|real|final)\b[\s\S]{0,20}\b(profit|job\s*cost|cost)\b|\bbid\s+vs\.?\s+actual\b/i },
  { key: "true_takeoff", name: "True Takeoff", divisions: ["est", "field"], members: ["takeoff_spf", "building"],
    play: "A measured takeoff that already accounts for the spray window — quantities you can actually hit on site.",
    re: /\b(takeoff|board.?feet|measure|square\s?footage|how much foam)\b[\s\S]{0,50}\b(spray window|conditions|weather|dew.?point|too cold|substrate)\b/i },
  { key: "book_capacity", name: "Book to Capacity", divisions: ["field", "growth"], members: ["appointment", "scheduling"],
    play: "Sell only what the crew and rig can actually deliver — book the work against real capacity.",
    re: /\b(book|schedule|take on|fit in|squeeze in|can we handle|do we have)\b[\s\S]{0,50}\b(capacity|crew|rig|slammed|booked|deliver|handle|another job)\b/i },
  { key: "teaming_outreach", name: "Teaming Outreach", divisions: ["gov", "growth"], members: ["teaming", "lead_hunter"],
    play: "Find primes and teaming partners for bigger federal/commercial work, and open the conversation.",
    re: /\b(teaming|team up|prime|subcontract|joint venture|jv|partner)\b[\s\S]{0,50}\b(federal|gov|find|reach out|opportunit|prime|bigger)\b/i },
];

const BYK = {}; DIVISIONS.forEach((d) => { BYK[d.key] = d; });
const OPP = {}; AXES.forEach(({ a, b }) => { OPP[a] = b; OPP[b] = a; });
const setKey = (divs) => [...divs].sort().join("+");
const FEAT_BY = {}; FEATURED.forEach((c) => { FEAT_BY[setKey(c.divisions)] = c; });

// two divisions are adjacent (share a cube edge) iff they're not the same and not an opposite pair.
function adjacent(a, b) { return a !== b && OPP[a] !== b; }
// all 12 adjacent pairs (the cube's edges).
function edges() {
  const ks = DIVISIONS.map((d) => d.key), out = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (adjacent(ks[i], ks[j])) out.push([ks[i], ks[j]]);
  return out;
}
// all 8 corners = one division from each axis (2 × 2 × 2). Each corner's three divisions are mutually adjacent.
function corners() {
  const out = [];
  for (const A of [AXES[0].a, AXES[0].b]) for (const B of [AXES[1].a, AXES[1].b]) for (const C of [AXES[2].a, AXES[2].b]) out.push([A, B, C]);
  return out;
}
const shortName = (k) => BYK[k].name.split(" ")[0];
function genName(divs) { return divs.map(shortName).join(" × "); }
function genPlay(divs) {
  return "Where " + divs.map((k) => BYK[k].name).join(" meets ") + " — convene " +
    divs.map((k) => BYK[k].lead).join(" + ") + " to cover every angle in one turn.";
}
// The capability for any set of divisions (1, 2, or 3). Featured override wins; otherwise generated.
function capabilityFor(divs) {
  const sk = setKey(divs);
  const kind = divs.length === 1 ? "face" : divs.length === 2 ? "edge" : "corner";
  const feat = FEAT_BY[sk];
  if (feat) return { key: sk, kind, divisions: [...divs], name: feat.name, members: feat.members, play: feat.play, featured: true, trigger: feat.re.source };
  if (divs.length === 1) {
    const d = BYK[divs[0]];
    return { key: sk, kind: "face", divisions: [d.key], name: d.name, members: d.members, lead: d.lead, featured: false, trigger: null,
      play: "The " + d.name + " division — " + d.members.length + " specialists, led by " + d.lead + "." };
  }
  return { key: sk, kind, divisions: [...divs], name: genName(divs), members: divs.map((k) => BYK[k].lead), play: genPlay(divs), featured: false, trigger: null };
}
// The whole cube — 6 + 12 + 8 = 26 capabilities.
function enumerate() {
  const faces = DIVISIONS.map((d) => capabilityFor([d.key]));
  const ed = edges().map(capabilityFor);
  const co = corners().map(capabilityFor);
  return { faces, edges: ed, corners: co,
    counts: { faces: faces.length, edges: ed.length, corners: co.length, total: faces.length + ed.length + co.length, featured: FEATURED.length } };
}
function all() { const e = enumerate(); return e.faces.concat(e.edges, e.corners); }
// Router fast-path: only FEATURED plays auto-fire (tuned triggers). Generated combos never auto-match.
function matchText(text) {
  const t = (text == null ? "" : String(text)).trim();
  if (!t || t.length > 240) return null;
  for (const c of FEATURED) if (c.re.test(t)) return c;
  return null;
}
// Convene any piece explicitly by its setKey (e.g. "est+money") → a ready team plan.
function planFor(key) {
  const cap = all().find((c) => c.key === key || c.key === setKey(String(key).split("+")));
  if (!cap) return null;
  return { minds: cap.members.slice(0, 4), name: cap.name, kind: cap.kind, divisions: cap.divisions };
}

module.exports = (req, res) => {
  const e = enumerate();
  res.status(200).json({ ok: true, cube: "4×4×4 · 6 divisions", pieces: e.counts,
    axes: AXES, divisions: DIVISIONS.map((d) => ({ key: d.key, name: d.name, color: d.color, lead: d.lead, specialists: d.members.length })),
    faces: e.faces, edges: e.edges, corners: e.corners,
    note: "Every one of the 26 cube pieces maps to a capability. Featured plays have a router trigger and a hand-tuned team; the rest are auto-generated suggestions (the lead of each division) — promote one to featured when it earns its keep." });
};

module.exports.DIVISIONS = DIVISIONS;
module.exports.AXES = AXES;
module.exports.FEATURED = FEATURED;
module.exports.adjacent = adjacent;
module.exports.edges = edges;
module.exports.corners = corners;
module.exports.capabilityFor = capabilityFor;
module.exports.enumerate = enumerate;
module.exports.all = all;
module.exports.matchText = matchText;
module.exports.planFor = planFor;
module.exports.setKey = setKey;
