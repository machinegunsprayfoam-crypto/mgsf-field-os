// Warranty certificate PDF — a real document to hand the customer at job close. No keys, no npm;
// builds a genuine PDF via lib/pdf. Draft/record only — it states the terms you enter, invents
// nothing. Pairs with the app's log_warranty action (which records the warranty in the CRM).
//
// POST { customer, address, jobType, product, termYears, start, coverage, exclusions, certNo }
//   base64:true -> JSON { ok, filename, base64 };  else raw application/pdf.
// GET -> shape.

const { renderDocument } = require("../lib/pdf");

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

function addYears(iso, yrs) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const d = new Date(iso + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + yrs);
  return d.toISOString().slice(0, 10);
}

function build(body) {
  const customer = clean(body.customer, 80) || "OWNER INPUT REQUIRED — customer";
  const address = clean(body.address, 120);
  const jobType = clean(body.jobType, 80) || "spray foam / concrete work";
  const product = clean(body.product, 80);
  const termYears = Math.max(1, Math.round(num(body.termYears, 5)));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(body.start || "") ? body.start : new Date().toISOString().slice(0, 10);
  const end = addYears(start, termYears);
  const certNo = clean(body.certNo, 24);
  const coverage = clean(body.coverage, 600) ||
    "Machine Gun Spray Foam & Concrete Lifting, LLC warrants the workmanship of the installation described above against defects in application for the term stated, under normal use and conditions.";
  const exclusions = clean(body.exclusions, 600) ||
    "Excludes damage from structural movement, water intrusion from unrelated sources, alterations by others, abuse, or acts of God. Not transferable unless stated in writing.";

  const elements = [
    { type: "heading", text: "Machine Gun Spray Foam & Concrete Lifting, LLC", size: 17 },
    { type: "text", text: "Veteran-Owned  |  Glendive, MT  |  Serving MT / ND / SD / WY  |  machinegunsprayfoam.info", size: 9 },
    { type: "gap", h: 6 }, { type: "rule" },
    { type: "gap", h: 8 },
    { type: "center", text: "WARRANTY CERTIFICATE", size: 18, bold: true },
    { type: "gap", h: 12 },
    { type: "kv", k: "Certificate No.", v: certNo || "(assign)" },
    { type: "kv", k: "Issued to", v: customer },
    { type: "kv", k: "Property", v: address || "(address)" },
    { type: "kv", k: "Work performed", v: jobType },
    ...(product ? [{ type: "kv", k: "Product/system", v: product }] : []),
    { type: "kv", k: "Term", v: termYears + " year" + (termYears === 1 ? "" : "s") },
    { type: "kv", k: "Effective", v: start },
    { type: "kv", k: "Expires", v: end || "(set start date)" },
    { type: "gap", h: 10 }, { type: "rule" }, { type: "gap", h: 6 },
    { type: "subheading", text: "Coverage" },
    { type: "text", text: coverage, size: 10 },
    { type: "gap", h: 6 },
    { type: "subheading", text: "Exclusions" },
    { type: "text", text: exclusions, size: 10 },
    { type: "gap", h: 8 },
    { type: "text", text: "To make a claim, contact Machine Gun Spray Foam with this certificate number. We stand behind our work.", size: 10 },
    { type: "gap", h: 18 },
    { type: "sign", label: "Authorized signature" },
    { type: "gap", h: 6 },
    { type: "text", text: "Machine Gun Spray Foam & Concrete Lifting, LLC  ·  veteran-owned  ·  machinegunsprayfoam.info", size: 8 },
  ];
  return { elements, certNo, customer, end };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { customer: "", address: "", jobType: "", product: "", termYears: 5, start: "YYYY-MM-DD", coverage: "", exclusions: "", certNo: "" } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const { elements } = build(body);
    const buf = renderDocument({ elements });
    const filename = "Warranty" + (body.certNo ? "-" + String(body.certNo).replace(/[^\w-]/g, "") : "") + ".pdf";
    if (body.base64 === true) { res.status(200).json({ ok: true, filename, bytes: buf.length, base64: buf.toString("base64") }); return; }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buf);
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.build = build;
