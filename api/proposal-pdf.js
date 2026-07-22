// Proposal PDF — turns an estimate into a branded, emailable MGSF proposal document.
//
// Builds a REAL PDF by hand (PDF 1.4, standard Helvetica — no font embedding, no npm, no
// build step). The crew can attach the file to a text or email; nothing about it needs a
// browser "print to PDF." Pure arithmetic + string building; every dollar figure is caller-
// supplied — we never invent a price.
//
// POST { company?, customer:{name,address,cityStateZip,email,phone}, proposalNo, date,
//        items:[{desc, qty, unit, amount}], notes, terms, validDays }
//   default  -> raw application/pdf bytes (hitting the URL downloads Proposal.pdf)
//   base64:true in body -> JSON { ok, filename, base64 } for easy client-side download
// GET -> the expected shape.

// ---- tiny PDF writer ------------------------------------------------------
const PAGE_W = 612, PAGE_H = 792, ML = 54, MR = 558;   // Letter, 3/4" margins

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/[^\x20-\x7E]/g, "")     // ASCII only (standard-14 WinAnsi safe subset)
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
// Naive word-wrap by character budget (Helvetica ~ avg 0.5em; conservative chars/line).
function wrap(text, maxChars) {
  const words = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// A page is a list of ops; we emit the content stream from them.
function buildDoc(spec) {
  const pages = [];          // each: array of {op}
  let ops = [];              // current page ops
  let y = PAGE_H - 56;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = PAGE_H - 56; };
  const text = (x, yy, size, font, str) => ops.push(`BT /${font} ${size} Tf ${x} ${yy} Td (${esc(str)}) Tj ET`);
  const rule = (yy) => ops.push(`${ML} ${yy} m ${MR} ${yy} l 0.6 w 0.4 0.4 0.4 RG S`);
  const need = (h) => { if (y - h < 64) { newPage(); } };

  const company = spec.company || "Machine Gun Spray Foam & Concrete Lifting, LLC";
  const cust = spec.customer || {};
  const items = Array.isArray(spec.items) ? spec.items : [];
  const money = (n) => "$" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---- Header ----
  text(ML, y, 19, "F2", company); y -= 18;
  text(ML, y, 9, "F1", "Veteran-Owned  |  Spray Foam Insulation  |  Concrete Lifting  |  Coatings"); y -= 12;
  if (spec.contact) { text(ML, y, 9, "F1", spec.contact); y -= 12; }
  y -= 4; rule(y); y -= 22;

  // ---- Title + meta ----
  text(ML, y, 15, "F2", "PROPOSAL");
  const meta = [];
  if (spec.proposalNo) meta.push("No. " + spec.proposalNo);
  meta.push(spec.date || new Date().toISOString().slice(0, 10));
  text(MR - (meta.join("   ").length * 5), y, 10, "F1", meta.join("   ")); y -= 22;

  // ---- Prepared for ----
  text(ML, y, 10, "F2", "Prepared for:"); y -= 14;
  const custLines = [cust.name, cust.address, cust.cityStateZip,
    [cust.phone, cust.email].filter(Boolean).join("  ·  ")].filter(Boolean);
  if (!custLines.length) custLines.push("OWNER INPUT REQUIRED — customer name/address");
  for (const l of custLines) { text(ML, y, 10, "F1", l); y -= 13; }
  y -= 8; rule(y); y -= 18;

  // ---- Line-item header ----
  const COL_QTY = 372, COL_UNIT = 428, COL_AMT = 498;
  const headerRow = (yy) => {
    text(ML, yy, 10, "F2", "Description");
    text(COL_QTY, yy, 10, "F2", "Qty");
    text(COL_UNIT, yy, 10, "F2", "Unit");
    text(COL_AMT, yy, 10, "F2", "Amount");
  };
  headerRow(y); y -= 6; rule(y); y -= 15;

  // ---- Line items ----
  let subtotal = 0;
  for (const it of items) {
    const amt = Number(it.amount) || 0; subtotal += amt;
    const descLines = wrap(it.desc || "(item)", 62);
    need(descLines.length * 12 + 6);
    if (y === PAGE_H - 56) { headerRow(y); y -= 6; rule(y); y -= 15; }  // repeat header on a fresh page
    // first line carries qty/unit/amount
    text(ML, y, 10, "F1", descLines[0]);
    if (it.qty != null && it.qty !== "") text(COL_QTY, y, 10, "F1", String(it.qty));
    if (it.unit) text(COL_UNIT, y, 10, "F1", String(it.unit));
    text(COL_AMT, y, 10, "F1", money(amt));
    y -= 12;
    for (let i = 1; i < descLines.length; i++) { text(ML + 10, y, 10, "F1", descLines[i]); y -= 12; }
    y -= 3;
  }
  if (!items.length) { text(ML, y, 10, "F1", "OWNER INPUT REQUIRED — add line items"); y -= 14; }

  // ---- Totals ----
  y -= 4; rule(y); y -= 18;
  const total = spec.total != null ? Number(spec.total) : subtotal;
  const totRow = (label, val, bold) => { text(COL_UNIT - 40, y, 10, bold ? "F2" : "F1", label); text(COL_AMT, y, 10, bold ? "F2" : "F1", money(val)); y -= 15; };
  if (spec.total != null && spec.total !== subtotal) totRow("Subtotal", subtotal, false);
  totRow("TOTAL", total, true);

  // ---- Notes / terms ----
  y -= 10;
  if (spec.notes) { need(40); text(ML, y, 10, "F2", "Scope / Notes"); y -= 14; for (const l of wrap(spec.notes, 92)) { need(14); text(ML, y, 9, "F1", l); y -= 12; } y -= 6; }
  const validDays = Number(spec.validDays) || 30;
  const terms = spec.terms || `This proposal is valid for ${validDays} days from the date above. Work performed per MGSF standard terms; ` +
    `50% deposit to schedule, balance due on completion. Prices assume standard access and conditions.`;
  need(40); text(ML, y, 10, "F2", "Terms"); y -= 14; for (const l of wrap(terms, 100)) { need(14); text(ML, y, 9, "F1", l); y -= 12; }

  // ---- Footer signature line ----
  need(50); y -= 14;
  text(ML, y, 9, "F1", "Accepted: ______________________________     Date: ______________"); y -= 20;
  text(ML, y, 8, "F1", "Machine Gun Spray Foam & Concrete Lifting, LLC  ·  veteran-owned  ·  machinegunsprayfoam.info");

  newPage();
  return { pages, total, subtotal };
}

// Serialize pages -> PDF bytes.
function renderPDF(spec) {
  const { pages, total } = buildDoc(spec);
  const objs = [];                              // objs[i] = string body of object (i+1)
  const nPages = pages.length;
  // object numbering: 1 Catalog, 2 Pages, 3 Font F1, 4 Font F2, then per page: Page + Content
  const fontF1 = 3, fontF2 = 4;
  const pageObjNums = [], contentObjNums = [];
  let next = 5;
  for (let i = 0; i < nPages; i++) { pageObjNums.push(next++); contentObjNums.push(next++); }

  objs[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[1] = `<< /Type /Pages /Kids [${pageObjNums.map(n => n + " 0 R").join(" ")}] /Count ${nPages} >>`;
  objs[2] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  for (let i = 0; i < nPages; i++) {
    const content = pages[i].join("\n");
    objs[pageObjNums[i] - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R >> >> /Contents ${contentObjNums[i]} 0 R >>`;
    objs[contentObjNums[i] - 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  }

  // Assemble with byte offsets for xref.
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, "latin1");
  const count = objs.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 0; i < objs.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += xref;
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true,
      shape: { customer: { name: "", address: "", cityStateZip: "", email: "", phone: "" },
        proposalNo: "", date: "YYYY-MM-DD", items: [{ desc: "", qty: 0, unit: "", amount: 0 }], notes: "", terms: "", validDays: 30 } });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try {
    const buf = renderPDF(body);
    const filename = "Proposal" + (body.proposalNo ? "-" + String(body.proposalNo).replace(/[^\w-]/g, "") : "") + ".pdf";
    if (body.base64 === true) {
      res.status(200).json({ ok: true, filename, bytes: buf.length, base64: buf.toString("base64") });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buf);
  } catch (e) {
    res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 160) });
  }
};

module.exports.renderPDF = renderPDF;
