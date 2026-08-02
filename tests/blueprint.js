#!/usr/bin/env node
// Blueprint reader — pure parse core of api/blueprint.js. Run: `node tests/blueprint.js`.
// Deterministic, keyless, no network (vision call injected via opts.call). Covers title-block/legend/
// scope extraction, scope→CSI-trade mapping + prime/sub routing, dimensions-only-as-printed, the
// unreadable path, the not-configured path, vision payload shape (image + PDF), and the hard
// never-fabricate / not-a-measurement-tool guardrails.

const path = require("path");
const A = require(path.join(__dirname, "..", "api", "blueprint.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Blueprint reader (plan title block / legend / scope)\n");

const goodResp = { content: [{ type: "text", text: JSON.stringify({
  readable: true, confidence: "high",
  titleBlock: { project: "Glendive Shop", address: "2402 N Anderson Ave", sheet: "A-101", scale: '1/4"=1\'', date: "2026-07", drawnBy: "ACME Arch" },
  legend: [{ symbol: "SF", meaning: "spray foam insulation" }, { symbol: "E", meaning: "electrical" }],
  scope: [{ item: "Spray foam walls + roof deck", trade: "spray foam" }, { item: "Panel + branch wiring", trade: "electrical" }],
  dimensionsStated: [{ label: "Building", value: "40' x 60'" }, { label: "Wall height", value: "16'" }],
  notes: "Metal building.",
}) }] };

// ---- parseBlueprintResult: extraction ----
const r = A.parseBlueprintResult(goodResp);
ok("reads title block", r.titleBlock.project === "Glendive Shop" && r.titleBlock.scale === '1/4"=1\'');
ok("reads legend/key", r.legend.length === 2 && r.legend[0].meaning === "spray foam insulation");
ok("confidence normalized", r.confidence === "high");
ok("dimensions kept as printed strings (not computed)", r.dimensionsStated.some((d) => d.value === "40' x 60'"));

// ---- scope → CSI trade mapping (self-perform vs sub) ----
ok("spray foam scope → self-perform trade", r.scope.some((s) => s.trade === "spray-foam" && /self-perform/.test(s.role)));
ok("electrical scope → subcontract trade", r.scope.some((s) => s.trade === "electrical" && s.role === "subcontract"));

// ---- unreadable sheet ----
const bad = A.parseBlueprintResult({ content: [{ type: "text", text: JSON.stringify({ readable: false, confidence: "low", dimensionsStated: [] }) }] });
ok("unreadable ⇒ readable:false + no dimensions", bad.readable === false && bad.dimensionsStated.length === 0);
ok("garbage response ⇒ ok:false, not a guess", A.parseBlueprintResult({ content: [{ type: "text", text: "sorry" }] }).ok === false);

// ---- buildPayload: vision shape (image + PDF), forbids inventing dimensions ----
const pImg = A.buildPayload("BASE64DATA", "image/jpeg");
ok("image payload uses an image block with base64 source", pImg.messages[0].content[0].type === "image" && pImg.messages[0].content[0].source.media_type === "image/jpeg");
ok("payload system forbids inventing dimensions", /never invent[\s\S]*dimension/i.test(pImg.system));
ok("payload states it is not a measurement tool", /not a measurement tool/i.test(pImg.system));
const pPdf = A.buildPayload("BASE64DATA", "application/pdf");
ok("PDF payload uses a document block", pPdf.messages[0].content[0].type === "document" && pPdf.messages[0].content[0].source.media_type === "application/pdf");
ok("unknown media type falls back to png image", A.buildPayload("X", "image/tiff").messages[0].content[0].source.media_type === "image/png");

// ---- read(): gating + wiring + guardrails (injected vision call) ----
(async () => {
  const nc = await A.read({ image: "B64" }, { key: "" });
  ok("no key ⇒ configured:false, no fabrication", nc.configured === false && !nc.titleBlock);
  ok("no image ⇒ error", (await A.read({}, { key: "k" })).error === "need_image");

  const live = await A.read({ image: "B64", mediaType: "image/png" }, { key: "k", call: async () => goodResp });
  ok("live read returns label + verify caveat", /verify all measurements/i.test(live.label) && Array.isArray(live.verify) && live.verify.length >= 1);
  ok("live read routes scope into prime/sub structure", live.structure && live.structure.subs.some((s) => s.trade === "electrical") && live.structure.selfPerform.some((s) => s.trade === "spray-foam"));
  ok("data-URI prefix stripped from base64", (() => { let seen = ""; return A.read({ image: "data:image/png;base64,ABC" }, { key: "k", call: async (k, p) => { seen = p.messages[0].content[0].source.data; return goodResp; } }).then(() => seen === "ABC"); })());

  const boom = await A.read({ image: "B64" }, { key: "k", call: async () => { throw new Error("anthropic_500"); } });
  ok("vision error ⇒ ok:true, error surfaced, still carries verify", boom.ok === true && /500/.test(boom.error) && boom.verify.length >= 1);

  // never a price: no pricing fields anywhere in a full read
  const blob = JSON.stringify(live);
  ok("read output carries no pricing fields", !/"price"|"cost"|"rate"|\$\d/.test(blob));

  console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
