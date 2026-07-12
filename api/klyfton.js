// Ask Klyfton AI — the Klyfton "Hive" field assistant for Machine Gun Spray Foam.
// Not one generalist model: a Queen router recruits specialist minds in proportion
// to the job (like ant/bee recruitment), they work in parallel, then a synthesizer +
// critic merges and fact-checks the answer before it reaches the crew.
//
// Runs as a Vercel serverless function. No npm deps (uses global fetch).
// Requires env var ANTHROPIC_API_KEY (Vercel → Settings → Environment Variables).
// Optional env var CREW_CODE: if set, the client must send a matching { code }.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Model roles. Router is a cheap/fast classifier; the workers + critic are the smart tier.
// Tuned for cost: Sonnet workers/critic (~60-80% cheaper than Opus, still sharp).
// Bump WORKER/CRITIC to "claude-opus-4-8" for max smarts, or drop to "claude-haiku-4-5" for cheapest.
const ROUTER_MODEL = "claude-haiku-4-5";
const WORKER_MODEL = "claude-sonnet-5";
const CRITIC_MODEL = "claude-sonnet-5";

// ---- Monthly cost cap (opt-in) ------------------------------------------------
// Reuses the same Vercel KV / Upstash the sync module uses. Dormant unless KV is
// attached AND KLYFTON_MONTHLY_BUDGET_USD is set. Spend is tracked per calendar
// month (UTC) under mgsf:klyfton_cost:YYYY-MM; the key rolls over automatically.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN;
const MONTHLY_BUDGET_USD = parseFloat(process.env.KLYFTON_MONTHLY_BUDGET_USD || "0") || 0;
const KV_ON = !!(KV_URL && KV_TOKEN);

// USD per 1M tokens [input, output] — sticker prices (ignore intro discounts on
// purpose so the cap errs on the safe side: it stops a hair early, never late).
const PRICE = {
  "claude-haiku-4-5": [1, 5],
  "claude-sonnet-5": [3, 15],
  "claude-opus-4-8": [5, 25],
};
function costOf(model, usage) {
  if (!usage) return 0;
  const k = Object.keys(PRICE).find((p) => (model || "").indexOf(p) === 0) || "claude-sonnet-5";
  const [pin, pout] = PRICE[k];
  const inTok = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  const outTok = usage.output_tokens || 0;
  return (inTok * pin + outTok * pout) / 1e6;
}
function costKey() {
  const d = new Date();
  return "mgsf:klyfton_cost:" + d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}
async function kvSpentThisMonth() {
  try {
    const r = await fetch(KV_URL + "/get/" + encodeURIComponent(costKey()), { headers: { Authorization: "Bearer " + KV_TOKEN } });
    if (!r.ok) return 0;
    const j = await r.json();
    const v = parseFloat(j && j.result);
    return isFinite(v) ? v : 0;
  } catch { return 0; }
}
async function kvAddSpend(usd) {
  try {
    await fetch(KV_URL + "/incrbyfloat/" + encodeURIComponent(costKey()) + "/" + encodeURIComponent(usd), {
      method: "POST",
      headers: { Authorization: "Bearer " + KV_TOKEN },
    });
  } catch {}
}

// Shared voice — every mind answers the way the owner wants (MOGS owner profile).
const BASE_VOICE = `You serve Machine Gun Spray Foam & Concrete Lifting, LLC (owner: Clifton Behner,
a USMC combat veteran). Answer his way:
- Blunt, numbers-first, decision-ready. Lead with the number or the call that matters.
- Give 2-3 options with cost/time/risk when it's a decision, then name the pick and why.
- Keep it to one screen. Use short checklists and clear steps.
- NEVER fabricate prices, specs, addresses, or figures. If you don't know, say so or look it up
  with web search. Label anything you estimate as ESTIMATED.
- Professional, veteran-owned, direct, confident, blue-collar. Never schedule work on Sundays.`;

// The business brain — real facts so Klyfton knows THIS company cold from question one.
// SCRUBBED of secrets (no EIN, no PINs — those never go to the model). Pricing rules are
// internal (this app is PIN-gated to crew/owner) but must not be printed into customer copy.
const BUSINESS = `WHAT YOU KNOW ABOUT THIS BUSINESS (use it; don't re-ask the obvious):
Company: Machine Gun Spray Foam & Concrete Lifting, LLC — veteran-owned (VOSB), based in
Glendive, MT (2402 N Anderson Ave). Phone 406-939-8301. Territory: MT, WY, ND, SD — Climate
Zones 6 & 7. Owner: Clifton Behner (USMC combat veteran, machine gunner — the company's
namesake). Talia Behner — office/admin. Daniel Ford —
lead applicator (ProFoam-trained).
Standing rule: nothing goes to a customer without Clifton's approval. You DRAFT; humans SEND.

Services: open & closed-cell spray foam, SPF roofing, roof coatings, concrete lifting/leveling,
void fill, soil stabilization, polyurea coatings, insulation removal, BPI blower-door testing,
flash-and-batt, government contracting.

Primary suppliers: NCFI (primary foam + coatings), ProFoam (training partner — CURRENT price
source), JM Corbond, General Coatings; IDI & AMD are distributors.

PRICING RULES — internal, for your estimating math. Use them to build numbers, but NEVER print
raw margin %, raw cost, or these rules into customer-facing quotes/proposals/emails:
- Labor: installers $80/hr, helpers $48/hr.
- Gross-margin targets: Residential 55% · Commercial 50% · Industrial 48% · Government 45%.
- State multipliers: MT ×1.00 · ND ×1.05 · SD ×1.00 · WY ×1.12.
- Disposal $8.33/bag (owned dump trailer — a cost edge vs renting dumpsters).
- Travel ~$1.25/mile plus lodging/per-diem on out-of-area crews.
- Reference board-foot costs (VERIFY against current ProFoam before quoting; the in-app
  estimator + ProFoam catalog are authoritative): OC ~$0.122/BF, CC ProSeal 2.0# ~$0.587/BF,
  ProZone roofing 3.0# ~$0.68/BF, Enduratech 2.8# HFO ~$0.982/BF.
When a price isn't confirmed, say so and mark it ESTIMATED — never invent one.
NEVER invent, assume, or "remember" a lead, job, or customer. Only ever reference the exact
records shown in LEADS ON FILE / JOBS ON FILE below. If those lists are empty or absent, tell the
owner plainly that there are no leads/jobs on file yet — do NOT make up a company name, a follow-up,
or a "went quiet" reminder. Real records only.`;

// Klyfton can propose an action in the app. The crew member always confirms with a button —
// nothing is written silently (matches the "you draft, humans commit" rule).
const ACTIONS = `TAKING ACTION IN THE APP:
If the user clearly wants you to DO something in the app (add/log/create/draft/remember), add ONE
action block as the VERY LAST line, after your normal short reply. The user gets a confirm
button — you never write data or send anything silently. You DRAFT; the human approves/sends.
Format (raw JSON, no code fences):
[[ACTION]]{"type":"...", ...}[[/ACTION]]
Supported types:
- add_lead:       {"type":"add_lead","name":"","value":0,"service":"","state":"MT","notes":""}
- add_job:        {"type":"add_job","customer":"","service":"","value":0}
- add_punch:      {"type":"add_punch","name":""}
- remember:       {"type":"remember","fact":""}
- draft_email:    {"type":"draft_email","to":"","subject":"","body":""}  (follow-ups, quotes, review asks — NEVER auto-sent)
- draft_proposal: {"type":"draft_proposal","customer":"","scope":"","price":0,"terms":""}  (pre-fills the Proposal screen for review)
- material_order: {"type":"material_order","supplier":"","job":"","items":"one item per line, with qty"}  (a purchase list to review)
- add_followup:   {"type":"add_followup","name":"","note":"","when":""}  (flags a lead for follow-up + logs the note)
- update_lead:    {"type":"update_lead","name":"","status":"","value":0,"notes":""}  (change a lead — status moves it in the pipeline; to ARCHIVE a dead lead set status to "Lost", to close a win set "Won")
- delete_lead:    {"type":"delete_lead","name":""}  (remove a lead entirely)
- update_job:     {"type":"update_job","customer":"","status":"","value":0}  (change a job — status one of Scheduled/In Progress/Completed/Cancelled; "Completed" or "Cancelled" archives it off the active board)
- delete_job:     {"type":"delete_job","customer":""}  (remove a job entirely)
- log_cost:       {"type":"log_cost","job":"","revenue":0,"material":0,"labor":0,"equipment":0,"other":0}  (record job-costing actuals so margin history builds)
- log_contact:    {"type":"log_contact","name":"","ctype":"call|text|email|visit|note","note":"","when":""}  (add to a customer's contact history)
- log_review:     {"type":"log_review","customer":"","stars":0,"platform":"Google","note":""}  (track a review or request; stars 0 = review requested)
- set_inventory:  {"type":"set_inventory","item":"","qty":0,"unit":"","reorderAt":0,"supplier":""}  (set stock on hand + reorder trigger)
- log_warranty:   {"type":"log_warranty","customer":"","job":"","wtype":"","termYears":5,"start":"YYYY-MM-DD","notes":""}  (register a job warranty)
- log_training:   {"type":"log_training","name":"","topic":"","date":"YYYY-MM-DD","expires":"YYYY-MM-DD"}  (OSHA/safety training record; expires optional)
- log_maintenance:{"type":"log_maintenance","equipment":"","service":"","date":"YYYY-MM-DD","meter":"","nextDue":"YYYY-MM-DD"}  (equipment service log)
- draft_sms:      {"type":"draft_sms","to":"","body":""}  (a customer text — SMS is short & friendly, NEVER auto-sent)
- share_financing:{"type":"share_financing","to":""}  (draft a text with the Hearth financing apply link for a customer)
- log_incident:   {"type":"log_incident","employee":"","itype":"Injury|Illness|Isocyanate exposure|Near-miss","jobName":"","outcome":"","description":"","date":"YYYY-MM-DD"}  (OSHA 300 recordable)
- log_complaint:  {"type":"log_complaint","complainant":"","jobName":"","address":"","description":"","resolution":"","date":"YYYY-MM-DD"}  (neighbor odor/nuisance complaint record)
- log_setuse:     {"type":"log_setuse","jobNum":"","product":"","sets":0}  (check foam sets out against a job number; decrements inventory)
- check_weather:  {"type":"check_weather","address":""}  (pull the LIVE NWS spray-condition go/no-go for a job address or place — use whenever the user asks whether/when it's OK to spray, roof, or coat at a specific location or named job. Put the job's real address from JOBS ON FILE, or the place the user named, in "address". This runs a real forecast in the app — you do NOT need to web-search the weather yourself when you emit this.)
Rules: ONE block max; ONLY when the user asked you to do/draft/create/change/remove something; OMIT
it entirely for normal questions. For update/delete, match by the name/customer the user gives. Use
the crew's real numbers/prices from context — never invent a price. For emails and proposals, write
them in Clifton's voice, ready for him to review and send. Always give your short normal reply above
the block. The user still taps a confirm button before anything is written or removed.`;

// The specialist castes of the hive. Each is the smart model with a focused charter.
const SPECIALISTS = {
  estimator: {
    name: "Estimator",
    focus: `You are the ESTIMATING mind. Board-feet, yield, coverage, set thickness, waste factor,
labor, markup, and quoting spray foam / coatings / concrete lifting. Show the math. Use the crew's
own product prices from the provided business context before any outside number.
If the user attaches a jobsite PHOTO: identify the substrate (metal, wood, CMU, concrete), estimate
the visible dimensions and square footage, STATE every assumption plainly, then compute a rough bid
from the crew's real prices — label each assumed figure ESTIMATED and give the owner a range, not a
single hard number. Offer to turn it into a reviewable draft with a draft_proposal action.`,
  },
  conditions: {
    name: "Spray-Conditions",
    focus: `You are the SPRAY-CONDITIONS mind. Substrate + ambient temp, dew point, humidity, wind,
open vs closed cell window, cure, re-coat times, and GO/NO-GO calls. When it depends on today's
weather at a location, use web search to pull current conditions.`,
  },
  materials: {
    name: "Materials",
    focus: `You are the MATERIALS/SUPPLIER mind. Foam sets, coatings, primers, PPE, gun/consumable
specs, data sheets, substitutions, and where to source. Use web search for current product specs
and availability. Never invent a price — say "owner to confirm" if unknown.`,
  },
  safety: {
    name: "Safety/JSA",
    focus: `You are the SAFETY/JSA mind. Hazards, PPE, ventilation, re-occupancy, respirators,
confined space, fall protection, SDS, and OSHA-aligned steps for SPF and concrete lifting. Be
specific and practical for a field crew.`,
  },
  ops: {
    name: "Ops",
    focus: `You are the OPS/SCHEDULING mind. Job sequencing, crew/time, timelines, customer comms,
and go/no-go on the day. Give a checklist and a timeline. Never schedule anything on a Sunday.`,
  },
  marketing: {
    name: "Marketing",
    focus: `You are the MARKETING mind for a veteran-owned spray foam / concrete lifting company in
MT/ND/WY/SD (cold Climate Zones 6-7). Write short, punchy, ready-to-post SOCIAL content: a
scroll-stopping first line, 2-4 tight sentences, one clear call to action (the free-quote link
app.machinegunsprayfoam.info/lead or call 406-939-8301), then 6-10 relevant hashtags on their own
line. Lean into cold-climate energy savings, metal buildings, shops, ag, crawlspaces, and the
veteran-owned angle. Vary the format across educational tips, before/after hooks, seasonal angles,
myth-busters, and soft offers. NEVER promise guaranteed savings or make mold-elimination claims.
When asked for several, number them and separate each with a line of '---'.`,
  },
  hunter: {
    name: "Lead-Hunter",
    focus: `You are the LEAD-HUNTER mind. Find real, current job opportunities for a veteran-owned
spray foam / concrete lifting company in MT/ND/WY/SD. USE WEB SEARCH to surface concrete leads:
new commercial/ag/industrial construction, metal-building projects, pole barns, warehouse/roof
projects, businesses expanding, and open government solicitations (SAM.gov / state) for insulation,
spray foam, or roof coating. For each opportunity give: what it is, where, why it's a fit, a source
link if you have one, and a ready-to-send outreach opener (call script or short email) in Clifton's
blunt veteran voice. Be honest — if you can't verify something is real, say so. Never fabricate a
company, contact, or contract. Prefer things they can act on this week; end with the 2-3 best bets.`,
  },
  general: {
    name: "Klyfton",
    focus: `You are the general field mind — spray foam, coatings, concrete lifting, estimating,
the business, and anything the crew or owner asks. Look things up when the answer depends on
current info.`,
  },
};

const WEB_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 4 };

function textFrom(content) {
  return (content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Turn the crew's uploaded photos/PDFs into Claude content blocks so a mind can SEE them.
// Images -> vision blocks; PDFs -> document blocks. Returns a plain string when nothing is attached.
function buildUserContent(text, attachments) {
  const atts = Array.isArray(attachments) ? attachments : [];
  if (!atts.length) return text;
  const blocks = [];
  for (const a of atts) {
    if (!a || !a.data) continue;
    if (a.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: a.media_type || "image/jpeg", data: a.data } });
    } else if (a.kind === "pdf") {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } });
    }
  }
  if (!blocks.length) return text;
  const hasPdf = atts.some((a) => a.kind === "pdf");
  const fallback = "Look at the attached " + (hasPdf ? "document" : "photo") + " and tell me what I need to know.";
  // Images/documents first, then the text — the shape Claude expects.
  blocks.push({ type: "text", text: text && text.trim() ? text : fallback });
  return blocks;
}

// Pull an optional [[MEMORY]] a ;; b [[/MEMORY]] block out of an answer so the client can
// store durable colony facts. Returns { text (clean), remember: [] }.
function splitMemory(raw) {
  const m = raw.match(/\[\[MEMORY\]\]([\s\S]*?)\[\[\/MEMORY\]\]/i);
  if (!m) return { text: raw.trim(), remember: [] };
  const remember = m[1]
    .split(";;")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  const text = raw.replace(m[0], "").trim();
  return { text, remember };
}

// One Anthropic call, resuming through pause_turn so server-side web search can finish.
// `meter` (optional {usd}) accumulates the dollar cost of the call for the monthly cap.
async function callClaude(key, payload, meter) {
  let data;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const errText = await r.text();
      const e = new Error("anthropic_" + r.status);
      e.detail = errText.slice(0, 300);
      throw e;
    }
    data = await r.json();
    if (data.stop_reason === "pause_turn") {
      payload = { ...payload, messages: payload.messages.concat([{ role: "assistant", content: data.content }]) };
      continue;
    }
    break;
  }
  // Cost visibility — one line per call in the Vercel function logs (model + token usage).
  try {
    const u = data && data.usage;
    console.log("[klyfton] call " + ((data && data.model) || "?") +
      " in=" + ((u && u.input_tokens) || 0) + " out=" + ((u && u.output_tokens) || 0));
  } catch (e) {}
  if (meter) meter.usd += costOf(data && data.model, data && data.usage);
  return data;
}

// Compact the app's real state + remembered facts into a system-prompt block, so the
// minds are grounded in THIS business, not a generic one.
function contextBlock(context, memory) {
  const parts = [];
  if (context && typeof context === "object") {
    const c = [];
    if (context.company) c.push("Company: " + context.company);
    if (context.activeJobs != null) c.push("Active jobs: " + context.activeJobs);
    if (context.openLeads != null) c.push("Open leads: " + context.openLeads);
    if (context.lastEstimate) c.push("Most recent estimate: " + context.lastEstimate);
    if (Array.isArray(context.products) && context.products.length)
      c.push("Priced products (name=cost): " + context.products.slice(0, 40).join(", "));
    if (Array.isArray(context.materials) && context.materials.length)
      c.push("PRICE BOOK — real consumable / coating / equipment prices (name=$cost). Quote these EXACT numbers when asked; never invent one:\n" + context.materials.slice(0, 140).join("; "));
    // Live record read — real leads/jobs so you can answer by name and act on the right record.
    if (Array.isArray(context.leadRecords) && context.leadRecords.length) {
      const lines = context.leadRecords.slice(0, 40).map((l) =>
        "• " + (l.name || "?") + " [" + (l.status || "New") + "]" +
        (l.service ? " " + l.service : "") + (l.state ? " " + l.state : "") +
        (l.value ? " $" + Number(l.value).toLocaleString() : "") +
        (l.phone ? " " + l.phone : "") + (l.town ? " — " + l.town : "") +
        (l.source ? " (src: " + l.source + ")" : "") + (l.notes ? " — " + l.notes : ""));
      c.push("LEADS ON FILE (real records — reference by name; you may propose update_lead / delete_lead / add_followup):\n" + lines.join("\n"));
    }
    if (Array.isArray(context.jobRecords) && context.jobRecords.length) {
      const lines = context.jobRecords.slice(0, 40).map((j) =>
        "• " + (j.customer || "?") + " [" + (j.status || "Scheduled") + "]" +
        (j.service ? " " + j.service : "") + (j.state ? " " + j.state : "") +
        (j.value ? " $" + Number(j.value).toLocaleString() : "") +
        (j.date ? " " + j.date : "") + (j.address ? " — " + j.address : "") +
        (j.crew ? " crew:" + j.crew : "") + (j.next ? " next:" + j.next : ""));
      c.push("JOBS ON FILE (real records — reference by customer; you may propose update_job / delete_job):\n" + lines.join("\n"));
    }
    // Ops intel (travel/tax/permits/financing/inventory/capacity/compliance) from the Ops Center.
    const opsMap = [
      ["travelPolicy", "Travel policy"], ["stateTax", "State material tax"],
      ["financing", "Customer financing"], ["lowStock", "LOW STOCK (reorder)"],
      ["reputation", "Reputation"], ["avgMargin", "Job margin"], ["capacity", "Capacity"],
      ["trainingDue", "Training expiring"], ["maintenanceDue", "Equipment service due"],
      ["insuranceDue", "Insurance/bond expiring"],
    ];
    opsMap.forEach(([k, label]) => { if (context[k]) c.push(label + ": " + context[k]); });
    if (c.length) parts.push("BUSINESS CONTEXT (use these real numbers first):\n" + c.join("\n"));
  }
  if (Array.isArray(memory) && memory.length) {
    parts.push("COLONY MEMORY (things you've been told to remember):\n- " + memory.slice(-20).join("\n- "));
  }
  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

// The Queen: cheap classifier that decides which minds to recruit and how big the job is.
async function route(key, userText, history, meter) {
  const sys = `You are the router for a field-assistant hive. Decide which specialist minds should
answer, and whether the job is simple (one mind) or complex (several).
Mind keys: estimator, conditions, materials, safety, ops, marketing, hunter, general.
Use "marketing" for social posts / content / captions / ads. Use "hunter" for finding new leads,
jobs, opportunities, or gov solicitations.
Return ONLY JSON, no prose: {"minds":["..."],"complexity":"simple"|"complex"}.
Rules: 1-4 minds. Use "complex" for decisions ("should I / which"), multi-topic asks (e.g. estimate
AND safety AND schedule), or comparisons. Use "simple" + one mind for a single direct question.
If unsure, {"minds":["general"],"complexity":"simple"}.`;
  const recent = (history || [])
    .slice(-4)
    .map((m) => (m.role === "user" ? "U: " : "A: ") + String(m.content).slice(0, 200))
    .join("\n");
  try {
    const data = await callClaude(key, {
      model: ROUTER_MODEL,
      max_tokens: 300,
      system: sys,
      messages: [{ role: "user", content: (recent ? recent + "\n\n" : "") + "U: " + userText }],
    }, meter);
    const j = textFrom(data.content).match(/\{[\s\S]*\}/);
    const parsed = j ? JSON.parse(j[0]) : null;
    let minds = (parsed && Array.isArray(parsed.minds) ? parsed.minds : [])
      .filter((k) => SPECIALISTS[k])
      .slice(0, 4);
    if (!minds.length) minds = ["general"];
    const complexity = parsed && parsed.complexity === "complex" ? "complex" : "simple";
    return { minds: complexity === "simple" ? [minds[0]] : minds, complexity };
  } catch {
    return { minds: ["general"], complexity: "simple" };
  }
}

// Run one specialist mind on the question.
async function runMind(key, mindKey, userText, history, ctx, attachments, meter) {
  const spec = SPECIALISTS[mindKey] || SPECIALISTS.general;
  const system = `${BASE_VOICE}\n\n${BUSINESS}\n\n${ACTIONS}\n\n${spec.focus}${ctx}`;
  const messages = (history || [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
  messages.push({ role: "user", content: buildUserContent(userText, attachments) });
  const data = await callClaude(key, {
    model: WORKER_MODEL,
    // Headroom so adaptive thinking can't eat the whole budget and truncate the
    // answer — estimates reason through board-foot math and need room for BOTH
    // the thinking and the final quote (Sonnet 5 adaptive thinking guidance).
    max_tokens: 8000,
    system,
    thinking: { type: "adaptive" },
    tools: [WEB_TOOL],
    messages,
  }, meter);
  return { mind: spec.name, text: textFrom(data.content), model: data.model || WORKER_MODEL };
}

// Short greetings / acks don't need the Queen — skip the router round-trip and
// answer straight from the general mind. Saves a Haiku call + latency on most turns.
function isTrivial(text, attachments) {
  if (Array.isArray(attachments) && attachments.length) return false;
  const t = (text || "").trim();
  if (!t) return false;
  if (t.length <= 12) return true;
  if (t.length < 40 && /^(hi|hey|hello|yo|sup|thanks|thank you|thx|ty|ok|okay|k|cool|nice|great|good morning|good afternoon|good evening|good job|well done|test|testing|ping|you there|u there)\b/i.test(t)) return true;
  return false;
}

// --- Streaming (SSE) plumbing: cut the dead-air on long hive answers ---
function sseInit(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // don't let a proxy buffer the stream
}
function sseSend(res, obj) {
  try { res.write("data: " + JSON.stringify(obj) + "\n\n"); } catch (e) {}
}

// One streaming Anthropic call. Forwards text deltas via onText; returns the full text.
// Used only for the synthesizer (no tools → no pause_turn to resume mid-stream).
async function callClaudeStream(key, payload, onText, meter) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!r.ok) {
    const errText = await r.text();
    const e = new Error("anthropic_" + r.status);
    e.detail = errText.slice(0, 300);
    throw e;
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "", model = "", inTok = 0, outTok = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.indexOf("data:") === 0);
      if (!line) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
      if (ev.type === "message_start" && ev.message) {
        if (ev.message.model) model = ev.message.model;
        if (ev.message.usage && ev.message.usage.input_tokens) inTok = ev.message.usage.input_tokens;
      }
      if (ev.type === "message_delta" && ev.usage && ev.usage.output_tokens != null) outTok = ev.usage.output_tokens;
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
        full += ev.delta.text;
        if (onText) onText(ev.delta.text);
      }
    }
  }
  try { console.log("[klyfton] stream " + (model || "?") + " in=" + inTok + " out=" + outTok); } catch (e) {}
  if (meter) meter.usd += costOf(model, { input_tokens: inTok, output_tokens: outTok });
  return { text: full, model };
}

// Marker-safe emitter: stream text to the client but never leak the tail-of-message
// [[MEMORY]] / [[ACTION]] blocks into the live preview. Markers are terminal per the
// prompt, so once we see "[[" everything after is markers — stop the preview there.
function makeEmitter(res) {
  let holding = false, pend = "";
  return function (t) {
    if (holding) return;
    pend += t;
    const mi = pend.indexOf("[[");
    if (mi === -1) {
      const keep = pend.endsWith("[") ? 1 : 0; // a lone trailing "[" might start "[["
      const out = pend.slice(0, pend.length - keep);
      if (out) sseSend(res, { t: out });
      pend = keep ? pend.slice(-1) : "";
    } else {
      const out = pend.slice(0, mi);
      if (out) sseSend(res, { t: out });
      pend = "";
      holding = true;
    }
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(200).json({
      text:
        "⚙️ Ask Klyfton AI isn't switched on yet. Owner: in Vercel → the mgsf-fieldos " +
        "project → Settings → Environment Variables, add ANTHROPIC_API_KEY, then Redeploy. " +
        "Until then the hive can't think — but the estimator, JSA, and time clock still work.",
      configured: false,
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  if (process.env.CREW_CODE && body.code !== process.env.CREW_CODE) {
    res.status(200).json({ text: "🔒 Crew code required to use Klyfton AI.", configured: true });
    return;
  }

  const userText = (body.message || "").toString().trim();

  // Photos / PDFs the crew attached — capped so one message can't blow the payload.
  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a) => a && a.data && (a.kind === "image" || a.kind === "pdf"))
    .slice(0, 6);

  if (!userText && !attachments.length) {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const ctx = contextBlock(body.context, body.memory);

  // The router is text-only; give it a hint when a message is just an attachment.
  const routeText = userText || "[user attached " + attachments.length + " " +
    (attachments.some((a) => a.kind === "pdf") ? "file(s)" : "photo(s)") + " with no caption]";

  // Client opts into token streaming with { stream:true } (or an SSE Accept header).
  const wantStream = body.stream === true || /text\/event-stream/i.test(req.headers.accept || "");

  // The synthesizer prompt is the same whether we stream it or not.
  const buildSynthSys = () => `${BASE_VOICE}\n\n${BUSINESS}\n\n${ACTIONS}${ctx}

You are the SYNTHESIZER and CRITIC of the hive. Below are answers from specialist minds for the
same question. Merge them into ONE answer in the owner's voice. Your job as critic:
- Cut contradictions; if minds disagree on a number, flag it and say what to verify.
- Remove anything that looks fabricated or unsupported. Keep real, sourced, or clearly-ESTIMATED facts.
- Lead with the TL;DR/number, then options+pick if it's a decision, then a tight checklist.
- One screen. Do not mention "minds", "agents", or this process — just answer the owner.
If there are durable facts worth remembering across sessions (a customer preference, a confirmed
price, a job detail), end with: [[MEMORY]] fact ;; fact [[/MEMORY]] — otherwise omit that block.`;

  // Per-request cost meter — every model call adds its dollar cost here.
  const meter = { usd: 0 };

  // Monthly cost cap (opt-in): needs KV attached AND KLYFTON_MONTHLY_BUDGET_USD set.
  // Over budget → refuse new AI work with a friendly note. The estimator, JSA drafts,
  // and time clock never touch this endpoint, so they keep working.
  if (KV_ON && MONTHLY_BUDGET_USD > 0) {
    const spent = await kvSpentThisMonth();
    if (spent >= MONTHLY_BUDGET_USD) {
      const msg = "🧯 Klyfton has reached this month's AI budget ($" + MONTHLY_BUDGET_USD.toFixed(0) +
        "). It resets on the 1st. Owner: raise KLYFTON_MONTHLY_BUDGET_USD in Vercel to lift it. The estimator, JSA drafts, and time clock all still work.";
      if (wantStream) { sseInit(res); sseSend(res, { done: true, configured: true, capped: true, text: msg }); res.end(); }
      else res.status(200).json({ configured: true, capped: true, text: msg });
      return;
    }
  }

  // The finally records this request's spend to KV (even with no budget set — so the
  // running monthly total is always watchable), on both the success and error paths.
  try {
  // ---- Streaming path: SSE, streams the synthesizer's tokens on hive answers ----
  if (wantStream) {
    sseInit(res);
    try {
      const plan = isTrivial(userText, attachments)
        ? { minds: ["general"], complexity: "simple" }
        : await route(key, routeText, history, meter);

      // Simple job → one mind (uses web search, so run non-streamed) → send the finished answer.
      if (plan.complexity === "simple" || plan.minds.length <= 1) {
        const only = await runMind(key, plan.minds[0], userText, history, ctx, attachments, meter);
        const { text, remember } = splitMemory(only.text || "I didn't get a usable answer — try rephrasing.");
        sseSend(res, { done: true, text, remember, configured: true, mode: "single", minds: [only.mind], model: only.model });
        res.end();
        return;
      }

      // Complex job → run the swarm (non-streamed), then stream the synthesizer.
      const workers = await Promise.all(
        plan.minds.map((m) => runMind(key, m, userText, history, ctx, attachments, meter).catch(() => null))
      );
      const answers = workers.filter((w) => w && w.text);
      if (!answers.length) {
        sseSend(res, { done: true, text: "The hive came back empty — try rephrasing.", configured: true });
        res.end();
        return;
      }
      if (answers.length === 1) {
        const { text, remember } = splitMemory(answers[0].text);
        sseSend(res, { done: true, text, remember, configured: true, mode: "single", minds: [answers[0].mind] });
        res.end();
        return;
      }

      const panel = answers.map((a) => `### ${a.mind} mind:\n${a.text}`).join("\n\n");
      const emit = makeEmitter(res);
      const { text: raw, model } = await callClaudeStream(
        key,
        {
          model: CRITIC_MODEL,
          max_tokens: 8000,
          system: buildSynthSys(),
          thinking: { type: "adaptive" },
          messages: [
            { role: "user", content: `Question:\n${userText}\n\nSpecialist answers:\n\n${panel}` },
          ],
        },
        (t) => emit(t),
        meter
      );
      const { text, remember } = splitMemory(raw || answers[0].text);
      sseSend(res, { done: true, text, remember, configured: true, mode: "hive", minds: answers.map((a) => a.mind), model: model || CRITIC_MODEL });
      res.end();
    } catch (e) {
      sseSend(res, {
        done: true,
        configured: true,
        text: "⚠️ Klyfton hit a snag reaching the hive (" + String(e.message || e).slice(0, 60) + "). Try again in a moment.",
        error: String(e.detail || e).slice(0, 200),
      });
      try { res.end(); } catch (_) {}
    }
    return;
  }

  // ---- Non-streaming path (JSON) — used by GROW tools and as the fallback ----
  try {
    // 1) Queen recruits the minds (skipped for trivial greetings/acks).
    const plan = isTrivial(userText, attachments)
      ? { minds: ["general"], complexity: "simple" }
      : await route(key, routeText, history, meter);

    // 2) Simple job → one mind answers directly (fast + cheap).
    if (plan.complexity === "simple" || plan.minds.length <= 1) {
      const only = await runMind(key, plan.minds[0], userText, history, ctx, attachments, meter);
      const { text, remember } = splitMemory(only.text || "I didn't get a usable answer — try rephrasing.");
      res.status(200).json({
        text,
        remember,
        configured: true,
        mode: "single",
        minds: [only.mind],
        model: only.model,
      });
      return;
    }

    // 3) Complex job → recruit the swarm in parallel.
    const workers = await Promise.all(
      plan.minds.map((m) => runMind(key, m, userText, history, ctx, attachments, meter).catch(() => null))
    );
    const answers = workers.filter((w) => w && w.text);
    if (!answers.length) {
      res.status(200).json({ text: "The hive came back empty — try rephrasing.", configured: true });
      return;
    }
    if (answers.length === 1) {
      const { text, remember } = splitMemory(answers[0].text);
      res.status(200).json({ text, remember, configured: true, mode: "single", minds: [answers[0].mind] });
      return;
    }

    // 4) Synthesizer + critic: merge the minds, kill contradictions/fabrication, one answer out.
    const panel = answers.map((a) => `### ${a.mind} mind:\n${a.text}`).join("\n\n");
    const synth = await callClaude(key, {
      model: CRITIC_MODEL,
      max_tokens: 8000,
      system: buildSynthSys(),
      thinking: { type: "adaptive" },
      messages: [
        { role: "user", content: `Question:\n${userText}\n\nSpecialist answers:\n\n${panel}` },
      ],
    }, meter);
    const { text, remember } = splitMemory(textFrom(synth.content) || answers[0].text);
    res.status(200).json({
      text,
      remember,
      configured: true,
      mode: "hive",
      minds: answers.map((a) => a.mind),
      model: synth.model || CRITIC_MODEL,
    });
  } catch (e) {
    res.status(200).json({
      text: "⚠️ Klyfton hit a snag reaching the hive (" + String(e.message || e).slice(0, 60) + "). Owner: check the ANTHROPIC_API_KEY. Try again in a moment.",
      error: String(e.detail || e).slice(0, 300),
      configured: true,
    });
  }
  } finally {
    if (KV_ON && meter.usd > 0) {
      try { await kvAddSpend(meter.usd.toFixed(6)); } catch (e) {}
    }
  }
};
