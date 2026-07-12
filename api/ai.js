// MGSF "AI Bidder" serverless proxy (Vercel Node function, Node 18+ global fetch)
// SECURITY: the Anthropic API key is read ONLY from process.env and is NEVER echoed.
// POST { mode:"parse"|"takeoff"|"roi_bill"|"roi_estimate"|"roi_narrative", ... } -> JSON.
// roi_narrative is JOB-TYPE-AWARE: pass model=insulation|roofing|coatings|concrete + computed numbers.
// Non-POST rejected.
// If the key is missing/empty -> HTTP 200 {ok:false,error:"AI_NOT_CONFIGURED"} so the app
// can show a friendly "AI setup needed" message instead of crashing.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_BODY_BYTES = 8 * 1024 * 1024; // ~8MB cap on upload

// --- CORS: allow same-origin; reflect origin only for our known domains ---
function allowOrigin(origin) {
  if (!origin) return null; // same-origin / non-CORS requests have no Origin header
  let host;
  try { host = new URL(origin).hostname; } catch (e) { return null; }
  if (host === 'machinegunsprayfoam.info' || host.endsWith('.machinegunsprayfoam.info')) return origin;
  if (host.endsWith('.vercel.app')) return origin; // the project's vercel.app domain
  if (host === 'localhost' || host === '127.0.0.1') return origin; // local dev
  return null;
}

function setCors(req, res) {
  const reflected = allowOrigin(req.headers.origin);
  if (reflected) res.setHeader('Access-Control-Allow-Origin', reflected);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  // Vercel may already parse JSON onto req.body; otherwise read the stream.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    if (Buffer.byteLength(req.body) > MAX_BODY_BYTES) throw new Error('TOO_LARGE');
    return JSON.parse(req.body);
  }
  return await new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('TOO_LARGE')); try { req.destroy(); } catch (e) {} return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(new Error('BAD_JSON')); }
    });
    req.on('error', reject);
  });
}

// Pull the first {...} JSON object out of a model text reply.
function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function callAnthropic(apiKey, payload) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const safe = (data && data.error && data.error.type) ? data.error.type : ('http_' + r.status);
    const e = new Error('AI_ERROR'); e.detail = safe; throw e;
  }
  // Concatenate text content blocks
  let text = '';
  if (Array.isArray(data.content)) {
    for (const blk of data.content) { if (blk && blk.type === 'text' && blk.text) text += blk.text; }
  }
  return text;
}

const PARSE_SYSTEM =
  'You extract spray-foam / roofing / concrete-lifting / coatings job inputs from a spoken or typed ' +
  'job description for a field estimator. Output ONLY a strict JSON object, no prose, no markdown fences. ' +
  'Shape: {"customer":{"name":string,"phone":string,"address":string,"state":string},"market":' +
  '"residential"|"commercial"|"government"|"agricultural","service":"foam"|"roof"|"concrete"|"coatings",' +
  '"foamProductHint":string,"thickness":number,"areaSqft":number,"lengthFt":number,"widthFt":number,' +
  '"zones":number,"roofShape":string,"coats":number,' +
  '"wallHeight":number,"perimeter":number,"roofPitch":string,' +
  '"gableCount":number,"pitch":number,' +
  '"heavyPrep":boolean,"occupied":boolean,"maskWindows":boolean,"maskFloors":boolean,' +
  '"prepCues":string,"maskingCues":string,"notes":string}. ' +
  'Include ONLY fields you can infer from the text. Numbers must be JSON numbers, not strings. ' +
  'Omit anything unknown. state is the 2-letter US code. If unsure of service, pick the best guess. ' +
  'wallHeight (ft) is the wall/ceiling height when the job is FOAMING WALLS rather than a flat ceiling/floor. ' +
  'perimeter (ft) is the building perimeter if stated; otherwise omit (the app derives 2x(L+W)). ' +
  'roofPitch is the roof slope when mentioned, as a string like "4:12","6:12","8:12", or "flat" for low-slope. ' +
  'gableCount (0,1, or 2) is the number of gable ends to foam when the description mentions gable ' +
  'walls/ends on a pitched building; omit or 0 if none. pitch is the numeric rise per 12 of run as a ' +
  'number (e.g. 6 for a 6:12 roof) — used only to size the gable triangle; omit when unknown. ' +
  'Set heavyPrep/occupied/maskWindows/maskFloors to true ONLY when the text clearly indicates the space is ' +
  'occupied/in use, that windows/floors/contents must be masked or covered, or that extra prep is required; ' +
  'put any supporting phrases in prepCues / maskingCues. All of these new fields are OPTIONAL — omit when unknown.';

const TAKEOFF_SYSTEM =
  'You are assisting a spray-foam contractor by producing a DRAFT takeoff from plan sets or spec sheets ' +
  '(PDF/images). This is a DRAFT for human review only and must be verified line by line by an estimator; ' +
  'never present it as final. Output ONLY strict JSON, no prose, no markdown fences. ' +
  'Shape: {"scopes":[{"service":"foam"|"roof"|"concrete"|"coatings","sqft":number,"foamProductHint":string,' +
  '"thickness":number,"notes":string,"confidence":"low"|"medium"|"high"}],"warnings":[string]}. ' +
  'Each scope is one measurable area. Put assumptions and anything ambiguous in notes/warnings. ' +
  'Use conservative confidence when measurements are inferred rather than labeled.';

// --- ROI (Customer Energy-Savings) system prompts ---
// NOTE: the app computes ALL ROI math deterministically. These modes only help the
// user FILL one input (annual energy cost) or WRITE a customer-facing paragraph.
const ROI_BILL_SYSTEM =
  'You read a customer utility bill (image or PDF) for a home-energy contractor and extract the ' +
  "customer's TOTAL annual energy cost. Be conservative. Output ONLY strict JSON, no prose, no markdown " +
  'fences. Shape: {"annualEnergyCost":number,"heatingCoolingShare":number,"fuelType":string,"notes":string}. ' +
  'annualEnergyCost is total annual energy spend in US dollars (number only, no symbols). ' +
  'If the bill shows only ONE month, multiply by 12 to annualize and SAY SO in notes (note that monthly ' +
  'bills vary by season, so this is a rough annualization). If an annual/12-month total is printed, use it ' +
  'directly. heatingCoolingShare is optional (0..1) only if the bill itemizes it; otherwise omit it. ' +
  'fuelType is one of propane, electric, natural gas, fuel oil when identifiable. Omit fields you cannot ' +
  'determine. Never invent a number you cannot support from the document.';

const ROI_ESTIMATE_SYSTEM =
  'You estimate a CONSERVATIVE typical TOTAL annual energy cost (all fuels) for a building in the ' +
  'upper-Midwest United States (MT/ND/SD/WY and similar cold climates), given square footage, US state, ' +
  'and primary heating fuel. Output ONLY strict JSON, no prose, no markdown fences. ' +
  'Shape: {"annualEnergyCost":number,"assumptions":string}. annualEnergyCost is a single conservative ' +
  'whole-dollar number (no symbols). Lean LOW rather than high. In assumptions, briefly state the ' +
  "climate zone, fuel, and that this is a rough ESTIMATE to be confirmed by the customer's actual bills.";

// roi_narrative is JOB-TYPE-AWARE. The user message supplies a `model`
// (insulation|roofing|coatings|concrete) plus ONLY the computed numbers. The
// prompt frames the note correctly per service type and enforces claims-to-avoid.
const ROI_NARRATIVE_SYSTEM =
  'You write a short, warm, NON-exaggerated customer-facing note for Machine Gun Spray Foam & Concrete ' +
  'Lifting (spray foam, SPF roofing, protective coatings, and concrete lifting). The user message names a ' +
  'service MODEL and supplies the only numbers you may use. ' +
  'HARD RULES: (1) Use ONLY the numbers given; never invent, add, round differently, or imply any other ' +
  'figure (no tax credits, no rebates, no lawsuit/liability dollars, no "save 30-50% energy" claims). ' +
  '(2) You MUST use the word "estimated" \u2014 these are estimates, not guarantees. ' +
  '(3) Write 2-3 plain sentences a contractor can show a customer. Output ONLY the paragraph text \u2014 no JSON, ' +
  'no markdown, no headings. ' +
  'FRAME BY MODEL: ' +
  '- insulation: frame around estimated annual/monthly ENERGY savings and simple payback from air sealing + ' +
  'insulation. ' +
  '- roofing: frame around RESTORE-VS-REPLACE savings (recoating costs far less than tear-off & replacement) ' +
  'and added roof service life. Do NOT claim large cooling/energy savings; in cold climates cool-roof cooling ' +
  'savings are minimal, so emphasize roof life, restoration value, and added insulation \u2014 mention energy ONLY ' +
  'if an energy number is explicitly provided, and keep it modest. ' +
  '- coatings: frame around protecting the asset, extending its service life, and restoration costing far ' +
  'less than replacement. Do NOT claim it repairs structurally failed assets. ' +
  '- concrete: frame around LIFT-VS-REPLACE savings (lifting costs about half of tear-out & replacement), ' +
  'same-day usability, and that polyurethane is waterproof and will not wash out. Trip hazards are a safety ' +
  'benefit only \u2014 never attach a dollar figure to them. Do NOT claim it fixes structurally failed slabs. ' +
  'Never over-promise.';

module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !String(apiKey).trim()) {
    sendJson(res, 200, { ok: false, error: 'AI_NOT_CONFIGURED' });
    return;
  }

  let body;
  try { body = await readBody(req); }
  catch (e) {
    if (e.message === 'TOO_LARGE') { sendJson(res, 413, { ok: false, error: 'TOO_LARGE' }); return; }
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST' }); return;
  }

  const mode = body && body.mode;

  try {
    if (mode === 'parse') {
      const text = String((body && body.text) || '').slice(0, 8000);
      if (!text.trim()) { sendJson(res, 400, { ok: false, error: 'NO_TEXT' }); return; }
      const reply = await callAnthropic(apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: PARSE_SYSTEM,
        messages: [{ role: 'user', content: 'Job description:\n' + text }]
      });
      const parsed = extractJson(reply);
      if (!parsed) { sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'unparseable_model_output' }); return; }
      sendJson(res, 200, { ok: true, parsed: parsed });
      return;
    }

    if (mode === 'takeoff') {
      const files = Array.isArray(body && body.files) ? body.files : [];
      if (!files.length) { sendJson(res, 400, { ok: false, error: 'NO_FILES' }); return; }
      const content = [];
      for (const f of files.slice(0, 10)) {
        if (!f || !f.dataB64) continue;
        const mime = String(f.mime || '');
        if (mime === 'application/pdf') {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
        } else if (mime.indexOf('image/') === 0) {
          content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: f.dataB64 } });
        }
      }
      if (!content.length) { sendJson(res, 400, { ok: false, error: 'NO_USABLE_FILES' }); return; }
      content.push({ type: 'text', text: 'Produce the DRAFT takeoff JSON for the attached plan/spec files. Remember: draft for human review.' });
      const reply = await callAnthropic(apiKey, {
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        thinking: { type: 'disabled' }, // structured JSON extraction — keep it fast, no thinking budget eaten
        system: TAKEOFF_SYSTEM,
        messages: [{ role: 'user', content: content }]
      });
      const draft = extractJson(reply) || {};
      sendJson(res, 200, {
        ok: true,
        scopes: Array.isArray(draft.scopes) ? draft.scopes : [],
        warnings: Array.isArray(draft.warnings) ? draft.warnings : []
      });
      return;
    }

    if (mode === 'roi_bill') {
      const files = Array.isArray(body && body.files) ? body.files : [];
      if (!files.length) { sendJson(res, 400, { ok: false, error: 'NO_FILES' }); return; }
      const content = [];
      for (const f of files.slice(0, 10)) {
        if (!f || !f.dataB64) continue;
        const mime = String(f.mime || '');
        if (mime === 'application/pdf') {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.dataB64 } });
        } else if (mime.indexOf('image/') === 0) {
          content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: f.dataB64 } });
        }
      }
      if (!content.length) { sendJson(res, 400, { ok: false, error: 'NO_USABLE_FILES' }); return; }
      content.push({ type: 'text', text: 'Extract the total annual energy cost from this utility bill as strict JSON.' });
      const reply = await callAnthropic(apiKey, {
        model: 'claude-sonnet-5',
        max_tokens: 512,
        thinking: { type: 'disabled' }, // structured JSON extraction — keep it fast, no thinking budget eaten
        system: ROI_BILL_SYSTEM,
        messages: [{ role: 'user', content: content }]
      });
      const bill = extractJson(reply);
      if (!bill || typeof bill.annualEnergyCost !== 'number') {
        sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'unparseable_model_output' }); return;
      }
      sendJson(res, 200, { ok: true, bill: bill });
      return;
    }

    if (mode === 'roi_estimate') {
      const sqft = Number((body && body.sqft) || 0);
      const state = String((body && body.state) || '').slice(0, 4);
      const fuelType = String((body && body.fuelType) || '').slice(0, 32);
      const prompt = 'Estimate conservative total annual energy cost. ' +
        'Square footage: ' + (sqft > 0 ? sqft : 'unknown') + '. ' +
        'State: ' + (state || 'unknown') + '. ' +
        'Primary heating fuel: ' + (fuelType || 'unknown') + '. ' +
        'Output strict JSON {annualEnergyCost, assumptions}.';
      const reply = await callAnthropic(apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
        system: ROI_ESTIMATE_SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      });
      const est = extractJson(reply);
      if (!est || typeof est.annualEnergyCost !== 'number') {
        sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'unparseable_model_output' }); return;
      }
      sendJson(res, 200, { ok: true, estimate: est });
      return;
    }

    if (mode === 'roi_narrative') {
      const n = (body && body.numbers) || {};
      let model = String((body && body.model) || 'insulation').toLowerCase();
      if (['insulation', 'roofing', 'coatings', 'concrete'].indexOf(model) < 0) model = 'insulation';
      const fmt = (v) => (v == null ? 'n/a' : String(v));
      const has = (v) => (v != null && !(typeof v === 'number' && isNaN(v)));
      const lines = ['Service model: ' + model];
      if (has(n.jobCost)) lines.push('This job cost (sell price): $' + fmt(n.jobCost));

      if (model === 'insulation') {
        if (has(n.annualSavings)) lines.push('Estimated annual energy savings: $' + fmt(n.annualSavings));
        if (has(n.monthlySavings)) lines.push('Estimated monthly energy savings: $' + fmt(n.monthlySavings));
        if (has(n.paybackYears)) lines.push('Estimated simple payback: ' + fmt(n.paybackYears) + ' years');
      } else if (model === 'roofing') {
        if (has(n.replacementCost)) lines.push('Estimated tear-off & replacement cost: $' + fmt(n.replacementCost));
        if (has(n.savingsVsReplace)) lines.push('Estimated savings vs. replacement: $' + fmt(n.savingsVsReplace));
        if (has(n.serviceLife)) lines.push('Restored roof service life note: ' + fmt(n.serviceLife));
        if (has(n.annualSavings)) lines.push('Minor estimated annual energy savings: $' + fmt(n.annualSavings));
      } else if (model === 'coatings') {
        if (has(n.replacementCost)) lines.push('Estimated replacement cost: $' + fmt(n.replacementCost));
        if (has(n.savingsVsReplace)) lines.push('Estimated savings vs. replacement: $' + fmt(n.savingsVsReplace));
        if (has(n.lifeExtension)) lines.push('Estimated added service life note: ' + fmt(n.lifeExtension));
        if (has(n.annualSavings)) lines.push('Optional minor estimated energy bonus: $' + fmt(n.annualSavings));
      } else if (model === 'concrete') {
        if (has(n.replacementCost)) lines.push('Estimated tear-out & replacement cost: $' + fmt(n.replacementCost));
        if (has(n.savingsVsReplace)) lines.push('Estimated savings vs. replacement: $' + fmt(n.savingsVsReplace));
        lines.push('Advantages: usable same day; polyurethane is waterproof and will not wash out.');
      }
      if (has(n.financingMonthly)) lines.push('Customer financing monthly payment: $' + fmt(n.financingMonthly));
      // VERBATIM-NUMBERS GUARD: collect every dollar figure we provided so the prompt can
      // forbid any other dollar amount. The model may reuse these EXACTLY or omit them, but
      // must never introduce a dollar figure that is not in this list.
      const allowedNums = []; const allowedVals = [];
      ['jobCost','financingMonthly','annualSavings','monthlySavings','replacementCost','savingsVsReplace']
        .forEach(function (k) { if (has(n[k]) && typeof n[k] === 'number') { allowedNums.push('$' + fmt(n[k])); allowedVals.push(Math.round(Number(n[k]))); } });
      const allowedLine = allowedNums.length
        ? ('\nThe ONLY dollar amounts you may write are exactly: ' + allowedNums.join(', ') +
           '. Do NOT write any other dollar figure, and do NOT re-round these. Omit any number not listed here.')
        : '\nDo NOT write any dollar figures (none were provided).';
      const prompt = 'Write the customer note for the "' + model +
        '" model using ONLY these estimated numbers:\n' + lines.join('\n') + allowedLine;
      const reply = await callAnthropic(apiKey, {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 384,
        system: ROI_NARRATIVE_SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      });
      const narrative = String(reply || '').trim();
      if (!narrative) { sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'empty_model_output' }); return; }
      // DETERMINISTIC NUMBER GUARD: every $ figure in the note must match a dollar amount we
      // supplied (compared as whole dollars). If the model invented or mis-rounded any dollar
      // figure, reject so the app shows plain numbers instead of a wrong figure to a customer.
      const found = narrative.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || [];
      const bad = found.some(function (tok) {
        const val = Math.round(Number(tok.replace(/[^0-9.]/g, '')));
        if (!isFinite(val)) return false;
        return allowedVals.indexOf(val) < 0;
      });
      if (bad) { sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'fabricated_number' }); return; }
      sendJson(res, 200, { ok: true, narrative: narrative });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'BAD_MODE' });
  } catch (e) {
    if (e && e.message === 'AI_ERROR') { sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: e.detail || 'upstream' }); return; }
    sendJson(res, 200, { ok: false, error: 'AI_ERROR', detail: 'unexpected' });
  }
};
