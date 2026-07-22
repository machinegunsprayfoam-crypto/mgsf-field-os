// Change-order PDF — documents a mid-job scope/price change for the customer to sign. Protects
// the crew and the customer (no "you never told me" disputes). Real PDF via lib/pdf, no keys/npm.
// Draft only. Amounts are caller-supplied; the new total is computed from them — nothing invented.
//
// POST { customer, address, jobRef, originalAmount, changes:[{desc, amount}], reason, coNo, date }
//   changes[].amount may be negative (a credit).  base64:true -> JSON; else raw application/pdf.
// GET -> shape.

const { renderDocument } = require("../lib/pdf");

function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 300); }
function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function money(n) { const v = Math.round((Number(n) || 0) * 100) / 100; return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function build(body) {
  const customer = clean(body.customer, 80) || "OWNER INPUT REQUIRED — customer";
  const address = clean(body.address, 120);
  const jobRef = clean(body.jobRef, 40);
  const coNo = clean(body.coNo, 24);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : new Date().toISOString().slice(0, 10);
  const originalAmount = num(body.originalAmount, 0);
  const changes = (Array.isArray(body.changes) ? body.changes : []).map((c) => ({ desc: clean(c && c.desc, 200) || "(change)", amount: num(c && c.amount, 0) }));
  const reason = clean(body.reason, 400);
  const delta = changes.reduce((s, c) => s + c.amount, 0);
  const newTotal = originalAmount + delta;

  const elements = [
    { type: "heading", text: "Machine Gun Spray Foam & Concrete Lifting, LLC", size: 16 },
    { type: "text", text: "Veteran-Owned  |  Glendive, MT  |  machinegunsprayfoam.info", size: 9 },
    { type: "gap", h: 6 }, { type: "rule" }, { type: "gap", h: 8 },
    { type: "center", text: "CHANGE ORDER", size: 17, bold: true },
    { type: "gap", h: 10 },
    { type: "kv", k: "Change Order No.", v: coNo || "(assign)" },
    { type: "kv", k: "Date", v: date },
    { type: "kv", k: "Customer", v: customer },
    { type: "kv", k: "Property", v: address || "(address)" },
    ...(jobRef ? [{ type: "kv", k: "Job / Contract ref", v: jobRef }] : []),
    { type: "gap", h: 8 }, { type: "rule" }, { type: "gap", h: 6 },
    { type: "subheading", text: "Changes to the work" },
  ];
  if (!changes.length) elements.push({ type: "text", text: "OWNER INPUT REQUIRED — list the change line items.", size: 10 });
  for (const c of changes) elements.push({ type: "text", text: `• ${c.desc}  —  ${money(c.amount)}`, size: 10 });
  if (reason) { elements.push({ type: "gap", h: 6 }, { type: "subheading", text: "Reason" }, { type: "text", text: reason, size: 10 }); }

  elements.push(
    { type: "gap", h: 8 }, { type: "rule" }, { type: "gap", h: 6 },
    { type: "kv", k: "Original contract", v: money(originalAmount) },
    { type: "kv", k: "This change order", v: money(delta) },
    { type: "kv", k: "NEW CONTRACT TOTAL", v: money(newTotal) },
    { type: "gap", h: 14 },
    { type: "text", text: "By signing, both parties agree to the scope and price change above. All other terms of the original contract remain in effect.", size: 9 },
    { type: "gap", h: 16 },
    { type: "sign", label: "Customer approval" },
    { type: "sign", label: "MGSF representative" },
  );
  return { elements, delta, newTotal };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { customer: "", address: "", jobRef: "", originalAmount: 0, changes: [{ desc: "", amount: 0 }], reason: "", coNo: "", date: "YYYY-MM-DD" } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const { elements } = build(body);
    const buf = renderDocument({ elements });
    const filename = "ChangeOrder" + (body.coNo ? "-" + String(body.coNo).replace(/[^\w-]/g, "") : "") + ".pdf";
    if (body.base64 === true) { res.status(200).json({ ok: true, filename, bytes: buf.length, base64: buf.toString("base64") }); return; }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buf);
  } catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) }); }
};

module.exports.build = build;
