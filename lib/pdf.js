// Minimal, dependency-free PDF writer shared by the document endpoints (warranty certs, change
// orders, etc.). Standard Helvetica — no font embedding, no npm. Declarative: build an `elements`
// array and call renderDocument(); it handles word-wrap and page overflow. Not for pixel-perfect
// layout — it's for clean, emailable business documents a contractor hands a customer.

const PAGE_W = 612, PAGE_H = 792, ML = 54, MR = 558;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
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

// elements: array of { type, ... }
//   heading   { text, size=15 }          bold, its own line
//   subheading{ text, size=11 }          bold
//   text      { text, size=10, bold }    wrapped paragraph
//   center    { text, size=12, bold }    centered line
//   kv        { k, v, size=10 }          "Label:  value"
//   rule      {}                          horizontal line
//   gap       { h=10 }                    vertical space
//   sign      { label='Accepted' }        signature + date line
function renderDocument(doc) {
  const elements = Array.isArray(doc.elements) ? doc.elements : [];
  const pages = []; let ops = []; let y = PAGE_H - 56;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = PAGE_H - 56; };
  const need = (h) => { if (y - h < 60) newPage(); };
  const put = (x, size, font, str) => ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${esc(str)}) Tj ET`);
  const rule = () => ops.push(`${ML} ${y} m ${MR} ${y} l 0.6 w 0.4 0.4 0.4 RG S`);
  const CHARS = { 8: 118, 9: 105, 10: 95, 11: 86, 12: 79, 15: 63, 19: 50 }; // approx chars/line by size

  for (const el of elements) {
    const t = (el && el.type) || "text";
    if (t === "gap") { y -= Math.max(1, el.h || 10); continue; }
    if (t === "rule") { need(8); y -= 2; rule(); y -= 12; continue; }
    if (t === "heading") { const s = el.size || 15; need(s + 8); put(ML, s, "F2", el.text || ""); y -= s + 6; continue; }
    if (t === "subheading") { const s = el.size || 11; need(s + 6); put(ML, s, "F2", el.text || ""); y -= s + 4; continue; }
    if (t === "center") {
      const s = el.size || 12, str = el.text || "";
      need(s + 4); const w = str.length * s * 0.5; put(Math.max(ML, (PAGE_W - w) / 2), s, el.bold ? "F2" : "F1", str); y -= s + 4; continue;
    }
    if (t === "kv") {
      const s = el.size || 10; need(s + 4); put(ML, s, "F2", (el.k || "") + ":");
      put(ML + 130, s, "F1", String(el.v == null ? "" : el.v)); y -= s + 4; continue;
    }
    if (t === "sign") {
      need(30); y -= 8;
      put(ML, 10, "F1", (el.label || "Accepted") + ": ______________________________     Date: ______________");
      y -= 16; continue;
    }
    // default: wrapped text
    const s = el.size || 10, font = el.bold ? "F2" : "F1";
    for (const line of wrap(el.text || "", CHARS[s] || 95)) { need(s + 3); put(ML, s, font, line); y -= s + 3; }
    if (el.after) y -= el.after;
  }
  newPage();

  // Serialize
  const objs = [];
  const nPages = pages.length;
  const pageNums = [], contentNums = [];
  let next = 5;
  for (let i = 0; i < nPages; i++) { pageNums.push(next++); contentNums.push(next++); }
  objs[0] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[1] = `<< /Type /Pages /Kids [${pageNums.map((n) => n + " 0 R").join(" ")}] /Count ${nPages} >>`;
  objs[2] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  for (let i = 0; i < nPages; i++) {
    const content = pages[i].join("\n");
    objs[pageNums[i] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNums[i]} 0 R >>`;
    objs[contentNums[i] - 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  }
  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (let i = 0; i < objs.length; i++) { offsets[i] = Buffer.byteLength(pdf, "latin1"); pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`; }
  const xrefPos = Buffer.byteLength(pdf, "latin1");
  const count = objs.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 0; i < objs.length; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += xref + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

module.exports = { renderDocument };
