// Capability Statement generator — the one-page SDVOSB doc every federal buyer asks for. Harvested
// from MOGS (CapabilityStatement.gs) into Klyfton. Real PDF via lib/pdf, no keys/npm.
//
// VERIFIED FACTS ONLY. Public federal identity (legal name, UEI) is baked in; anything not
// independently verified (past performance, bonding, insurance limits) prints as an explicit
// "OWNER INPUT REQUIRED" marker — never fabricated. Pass real values in the POST body to fill them.
//
// POST { pastPerformance:[..], differentiators:[..], cage, bonding, contactName, base64 }
//   base64:true -> JSON { ok, filename, base64 };  else raw application/pdf.
// GET -> the shape.

const { renderDocument } = require("../lib/pdf");

const MARK = "OWNER INPUT REQUIRED";
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 300); }

// Verified public identity (UEI is a public federal ID — fine in code; EIN is NOT and stays out).
const ENTITY = {
  legalName: "Machine Gun Spray Foam & Concrete Lifting, LLC",
  uei: "H63EELL3K7Z4",
  address: "2402 N Anderson Ave, Glendive, MT 59330",
  phone: "406-939-8301",
  email: "clifton@machinegunsprayfoam.info",
  website: "machinegunsprayfoam.info",
  naics: ["238310 — Drywall & Insulation Contractors", "238160 — Roofing Contractors", "238190 — Other Foundation/Structure/Building Exterior"],
};
const CORE = [
  "Spray polyurethane foam insulation (open & closed cell) — commercial, residential, agricultural",
  "SPF roofing systems & protective coatings (silicone / acrylic)",
  "Concrete lifting / leveling, void fill & soil stabilization (polyurethane)",
  "BPI-certified building performance — blower-door testing & energy audits",
  "Insulation removal, weatherization & air sealing",
];
const DIFF = [
  "Service-Disabled Veteran-Owned (USMC combat veteran / machine gunner — the company's namesake)",
  "BPI Building Analyst — building-science-trained, not spray-and-go",
  "ProFoam-certified applicators; NCFI foam & roofing systems",
  "Regional coverage: MT, ND, SD, WY (Climate Zones 6 & 7) — we work where others won't",
  "Direct owner involvement on every job; fast, firm written bids",
];

function build(body) {
  const cage = clean(body.cage, 40) || "Pending (DLA CAGE in process)";
  const contactName = clean(body.contactName, 60) || "Clifton Behner, Owner";
  const diff = (Array.isArray(body.differentiators) && body.differentiators.length ? body.differentiators.map((d) => clean(d, 160)) : DIFF);
  const past = (Array.isArray(body.pastPerformance) && body.pastPerformance.length ? body.pastPerformance.map((p) => clean(p, 200)) : [MARK + " — list 2-3 completed jobs (customer, scope, value, date)"]);
  const bonding = clean(body.bonding, 120) || (MARK + " — bonding capacity (ask Stockman: target $500K single / $1M aggregate)");

  const elements = [
    { type: "heading", text: ENTITY.legalName, size: 18 },
    { type: "center", text: "CAPABILITY STATEMENT", size: 13, bold: true },
    { type: "center", text: "Service-Disabled Veteran-Owned Small Business (SDVOSB)", size: 11 },
    { type: "gap", h: 6 }, { type: "rule" }, { type: "gap", h: 6 },
    { type: "subheading", text: "Company Data" },
    { type: "kv", k: "UEI", v: ENTITY.uei },
    { type: "kv", k: "CAGE", v: cage },
    { type: "kv", k: "Business type", v: "SDVOSB (SBA VetCert in progress; honorable USMC service on file)" },
    { type: "kv", k: "Location", v: ENTITY.address },
    { type: "kv", k: "Service area", v: "Montana, North Dakota, South Dakota, Wyoming" },
    { type: "kv", k: "Point of contact", v: contactName },
    { type: "kv", k: "Phone / email", v: ENTITY.phone + "  ·  " + ENTITY.email },
    { type: "gap", h: 6 }, { type: "rule" }, { type: "gap", h: 6 },
    { type: "subheading", text: "Core Competencies" },
    ...CORE.map((c) => ({ type: "text", text: "•  " + c, size: 10 })),
    { type: "gap", h: 6 },
    { type: "subheading", text: "Differentiators" },
    ...diff.map((d) => ({ type: "text", text: "•  " + d, size: 10 })),
    { type: "gap", h: 6 },
    { type: "subheading", text: "NAICS Codes" },
    ...ENTITY.naics.map((n) => ({ type: "text", text: "•  " + n, size: 10 })),
    { type: "gap", h: 6 },
    { type: "subheading", text: "Past Performance" },
    ...past.map((p) => ({ type: "text", text: "•  " + p, size: 10 })),
    { type: "gap", h: 4 },
    { type: "kv", k: "Bonding", v: bonding },
    { type: "gap", h: 10 },
    { type: "text", text: ENTITY.legalName + "  ·  " + ENTITY.phone + "  ·  " + ENTITY.website + "  ·  Veteran-Owned", size: 9 },
  ];
  return { elements, entity: ENTITY };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, verifiedOnly: true,
      shape: { cage: "", contactName: "", differentiators: [], pastPerformance: [], bonding: "", base64: false } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const { elements } = build(body);
    const buf = renderDocument({ elements });
    const filename = "MGSF-Capability-Statement.pdf";
    if (body.base64 === true) { res.status(200).json({ ok: true, filename, bytes: buf.length, base64: buf.toString("base64") }); return; }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buf);
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.build = build;
