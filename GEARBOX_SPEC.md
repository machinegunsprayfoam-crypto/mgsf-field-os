# Gearbox Spec — Klyfton's internal drivetrain (bidirectional module mesh)

> **The model (Clifton's).** Think of the modules as **gears**, not arms. Every gear has two faces:
> an **output face (teeth that push information OUT)** and an **input face (teeth that receive)**.
> Two gears **mesh** when one's output matches the other's input — turn one, the meshed gears turn.
> **Arms** reach *out of the machine* (execute in the world). **Gears** are the *transmission inside*
> (modules driving each other, both directions). Klyfton has good hands (arms) and almost no
> drivetrain (gears) — the brain hand-cranks each module. The gearbox is the drivetrain.

_Status: PHASE A+B BUILT (spine + first meshes) 2026-07-25. Rides on existing `notify.js` (outbound tooth) + `act.js` (arms/approval) +
Supabase. Plain `fetch`, no npm. Fixes the "good rooms, missing hallways" gap InfraNodus keeps flagging._

## 1. A tooth = a typed event
An event is a message with a defined shape. A gear's **output face** = the events it EMITS; its
**input face** = the events it CONSUMES. Teeth mesh only when the shapes line up (a contract).

```
event = { name, key, payload, source, at }
  name    "estimate.closed"     // dotted domain.verb
  key     "EST-1042"            // idempotency key (dedupe re-fires)
  payload { customer, amount, job, service, state }   // typed per event
  source  "estimator"          // which gear emitted
  at      ISO timestamp
```

## 2. Each module declares its faces
Every api module exports a `GEARS` descriptor — the registry reads these so meshing is explicit:
```js
module.exports.GEARS = {
  emits:    ["estimate.closed"],
  consumes: [{ event: "estimate.closed", handler: "onEstimateClosed" }],
};
```
Two gears mesh automatically when one's `emits` name appears in another's `consumes`.

## 3. The gearbox (`api/gearbox.js`) — the dispatcher
Vercel functions are stateless and short-lived, so the drivetrain needs a durable spine:
- **`events` table (Supabase)** — the record every gear-turn is written to (durable log + replay +
  the Command Center's "which gear drove which"). Columns: `id, name, key, payload jsonb, source,
  status ('pending'|'done'|'blocked'|'error'), created_at, processed_at, result jsonb`.
- **`emit(name, key, payload, source)`** helper — writes the event row (status pending) and kicks the
  dispatcher. Idempotent on `key` (a repeat key is a no-op — this is the dedupe that also honors the
  Hearth rule: if an external tool owns the outcome, the gear emits nothing).
- **`/api/gearbox`** — resolves consumers for an event from the registry and invokes each handler
  (in-process call when co-located, else `fetch` to the consumer endpoint), then marks the event
  done/blocked/error. A consumer handler may itself `emit()` — that's the next gear turning.

## 4. Safety: the drivetrain turns freely inside; the hands don't move without approval
- **Internal gears auto-turn** — reversible, zero-dollar transmission (update a record, log, draft) is
  full-autonomy per doctrine.
- **Any gear that produces an OUTWARD action stops at the arms.** The handler doesn't send — it calls
  `act.js`, which returns `needs_approval` until Clifton taps approve. So a chain can run end-to-end
  internally and queue the outward step as a draft. Never auto-sends truth; never fabricates.
- **Every turn is logged** (events table) — nothing happens silently, and it's all auditable.

## 5. Gear ratio (already half-built in the hive)
- **Step-up (1→N):** the Queen router turns once and drives many worker gears (fan-out).
- **Step-down (N→1):** the critic/synthesizer meshes all workers back into one output (fan-in).
The gearbox generalizes this across modules, not just inside one request.

## 6. First gear meshes to build (the money drivetrain)
1. **estimate.closed** → CRM gear (update pipeline stage, `lead.won`) → **lead.won**
2. **lead.won** → Invoice gear (draft invoice via act.js, gated) → **invoice.created**
3. **job.completed** → Review gear (draft review request) + Roof-Maintenance gear (enroll if SPF roof)
4. **estimate.sent** → Follow-up gear (schedule the 2/7/21-day reheat via estimate-followup.js)
Each mesh is a defined contract; each outward step is a gated draft.

## 7. Observability — the Command Center shows the drivetrain
The `events` table feeds a new Command Center strip: recent gear-turns, which gear drove which, and
anything **blocked awaiting approval** (this is also where the "arms running / pending" view lives).
Turns the dashboard from a data display into a live drivetrain view.

## 8. Build phases
- **A — Spine:** `events` table + `emit()` + `/api/gearbox` dispatcher + registry reader. (Low risk, additive.)
- **B — First meshes:** wire the 4 meshes in §6 (estimate→CRM→invoice; job→review/roof; estimate→follow-up).
- **C — Command Center strip:** render recent turns + blocked-awaiting-approval from `events`.
- **D — Backpressure/health:** retries on error gears, dead-letter for stuck events, dedupe metrics.

## 9. Constraints / guardrails
- Plain `fetch` + built-in `crypto` only (no npm; `vercel.json` = `echo skip-install`). Gated on Supabase.
- Outward teeth ALWAYS through `act.js` approval. Numbers defer to doctrine; never fabricate. No Sunday.
- Idempotent on `key` — a gear never double-fires. Honors the Hearth dedup (don't emit what Hearth owns).
- Additive/isolated — modules opt in by exporting `GEARS`; nothing breaks until they do.

## Cross-references
- [`api/act.js`](api/act.js) (arms/approval) · [`api/notify.js`](api/notify.js) (outbound tooth) ·
  [`api/estimate-followup.js`](api/estimate-followup.js) · [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md) ·
  [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md)
