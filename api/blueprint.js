// Klyfton BLUEPRINT READER — Phase 3 of the construction layer. Upload a plan sheet (image or PDF)
// and Klyfton READS it: the title block (project/address/sheet/scale), the legend/key (symbols), the
// scope of work shown (mapped to CSI trades), and any dimensions PRINTED on the plan. It then routes
// the scope into the estimator + construction/prime-sub split.
//
// GROUNDED, NEVER FABRICATED (doctrine #1 + the hard rules): it extracts ONLY what is actually on the
// sheet. It NEVER invents a dimension, area, or scale, and it is NOT a measurement tool — exact
// quantities are measured to scale in Bluebeam (the owner's tool) or verified in the field. If the
// scale/sheet is unreadable it says so and omits quantities. No pricing (pricing = mgsf-core doctrine).
//
// Gated on ANTHROPIC_API_KEY (vision). Inert + graceful without it. Pure parse core is unit-tested
// with an injected vision response. No npm; global fetch only.
//
// POST { image|pdf: base64, mediaType, notes? }   GET -> shape + supported inputs

const construction = require("./construction");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function _env(re) { for (const k of Object.keys(process.env)) { if (re.test(k) && process.env[k]) return process.env[k]; } return undefined; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 200); }
function arr(a, max) { return Array.isArray(a) ? a.slice(0, max || 40) : []; }

function extractJson(data) {
  const content = (data && data.content) || [];
  let text = "";
  for (const b of content) { if (b && b.type === "text" && b.text) text += b.text; }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// Pure: turn a vision response into our validated reading. Enforces the never-fabricate contract.
function parseBlueprintResult(data) {
  const obj = extractJson(data);
  if (!obj) return { ok: false, readable: false, note: "Couldn't read a structured result from the plan — try a clearer image or a single sheet." };
  const tb = obj.titleBlock || {};
  const titleBlock = {
    project: clean(tb.project, 160) || undefined, address: clean(tb.address, 200) || undefined,
    sheet: clean(tb.sheet, 40) || undefined, scale: clean(tb.scale, 60) || undefined,
    date: clean(tb.date, 40) || undefined, drawnBy: clean(tb.drawnBy, 120) || undefined,
  };
  const legend = arr(obj.legend, 60).map((l) => ({ symbol: clean(l && l.symbol, 40), meaning: clean(l && l.meaning, 160) })).filter((l) => l.symbol || l.meaning);
  // scope items → map each to a CSI trade/division (self-perform vs sub) via construction.js
  const scope = arr(obj.scope, 60).map((s) => {
    const item = clean(typeof s === "string" ? s : (s && (s.item || s.work)), 160);
    const hint = clean(typeof s === "string" ? s : (s && (s.trade || s.item || s.work)), 160);
    const div = construction.divisionFor(hint || item);
    return { item, trade: div && div.trade, division: div && div.n, divisionTitle: div && div.title, role: div ? (div.selfPerform ? "self-perform (MGSF)" : "subcontract") : undefined };
  }).filter((s) => s.item);
  // dimensions ONLY as printed on the plan — strings, never computed here
  const dimensionsStated = arr(obj.dimensionsStated || obj.dimensions, 60).map((d) => ({ label: clean(d && (d.label || d.name), 80), value: clean(d && (d.value || d.dim), 60) })).filter((d) => d.value);
  const readable = obj.readable !== false;
  const confidence = /high/i.test(obj.confidence) ? "high" : /med/i.test(obj.confidence) ? "medium" : "low";
  return {
    ok: true, readable, titleBlock, legend, scope, dimensionsStated,
    confidence, note: clean(obj.notes || obj.note, 400) || undefined,
  };
}

function buildPayload(b64, mediaType, modelId, notes) {
  const isPdf = /pdf/i.test(mediaType || "");
  const src = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: (IMG_TYPES.indexOf(mediaType) >= 0 ? mediaType : "image/png"), data: b64 } };
  const sys =
    "You read construction blueprints / plan sheets and return ONLY a JSON object (no prose): " +
    '{"readable":true|false,"confidence":"low|medium|high","titleBlock":{"project":"","address":"","sheet":"","scale":"","date":"","drawnBy":""},' +
    '"legend":[{"symbol":"","meaning":""}],"scope":[{"item":"","trade":""}],"dimensionsStated":[{"label":"","value":""}],"notes":""}. ' +
    "Extract the title block, the legend/key (symbol → meaning), the scope of work shown, and ONLY the dimensions/areas actually PRINTED on the sheet (as text, with their label). " +
    "HARD RULES: never invent, estimate, or infer a dimension, area, or scale that is not printed on the plan — omit what isn't shown. If the sheet or its scale is unreadable, set readable:false and return an empty dimensionsStated. You are a READING aid, not a measurement tool; the user measures to scale in Bluebeam.";
  return {
    model: modelId || _env(/BLUEPRINT_MODEL$/i) || "claude-sonnet-5",
    max_tokens: 1500,
    system: sys,
    messages: [{ role: "user", content: [src, { type: "text", text: "Read this plan sheet." + (notes ? (" Context: " + notes) : "") }] }],
  };
}

async function callAI(key, payload) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { const e = new Error("anthropic_" + r.status); e.detail = (await r.text()).slice(0, 200); throw e; }
  return r.json();
}

async function read(body, opts) {
  opts = opts || {};
  const b64 = clean(body.image || body.pdf || body.data, 12000000).replace(/^data:[^,]+,/, "");
  const mediaType = clean(body.mediaType || body.mimeType || (body.pdf ? "application/pdf" : "image/png"), 40);
  const notes = clean(body.notes, 300);
  if (!b64) return { ok: false, error: "need_image", note: "POST { image|pdf: base64, mediaType }" };
  const key = opts.key || _env(/ANTHROPIC_API_KEY$/i);
  const verify = ["Verify every dimension and the scale against the sheet — measure to scale in Bluebeam or in the field before quoting.", "Nothing here is a measurement or a price; scope only."];
  if (!key) return { ok: true, configured: false, note: "Blueprint reading needs ANTHROPIC_API_KEY (vision). Not configured.", verify };
  try {
    const call = opts.call || callAI;
    const data = await call(key, buildPayload(b64, mediaType, opts.model, notes));
    const r = parseBlueprintResult(data);
    // route the read scope through the prime/sub split so subs are surfaced immediately
    let structure = null;
    if (r.ok && r.scope && r.scope.length) { const trades = r.scope.map((s) => s.trade).filter(Boolean); if (trades.length) structure = construction.primeSubStructure({ trades }); }
    return { ok: true, configured: true, label: "READING — verify all measurements to scale (Bluebeam/field)", ...r, structure, verify,
      nextStep: r.readable ? "Confirm the scope, measure quantities to scale in Bluebeam, then run them through the estimator." : "Sheet/scale unreadable — upload a clearer single sheet." };
  } catch (e) {
    return { ok: true, configured: true, error: String((e && e.message) || e).slice(0, 140), note: "Vision read failed — try a clearer image or a single sheet.", verify };
  }
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, service: "blueprint", grounded: true, fabricates: false, measurementTool: false,
      inputs: { image: IMG_TYPES, pdf: "application/pdf" },
      note: "POST { image|pdf: base64, mediaType, notes? }. Reads the title block, legend/key, scope (mapped to CSI trades + prime/sub split), and dimensions PRINTED on the sheet. Never invents a measurement or scale — measure to scale in Bluebeam. No pricing." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  try { res.status(200).json(await read(body || {}, {})); }
  catch (e) { res.status(200).json({ ok: false, error: String((e && e.message) || e).slice(0, 140) }); }
};

// pure exports for the brain + tests
module.exports.extractJson = extractJson;
module.exports.parseBlueprintResult = parseBlueprintResult;
module.exports.buildPayload = buildPayload;
module.exports.read = read;
