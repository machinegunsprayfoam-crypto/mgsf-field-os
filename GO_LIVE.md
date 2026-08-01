# GO-LIVE — flip Klyfton AI on

**Status (verified locally this session):** all 44 `api/*.js` parse, load, and are wired
correctly (klyfton → ats + memory; gearbox → act + memory; axle → gearbox). The boot screen
(the 3D meshing gearbox) → PIN → app flow is intact. `vercel.json` present; `.vercelignore`
clean. **The code works.** What's left is runtime config + deploy — all owner actions below.

Every integration is **gated + graceful**: if a key is absent, that feature is simply OFF
(no crash, no fabrication). So you can go live with the ESSENTIALS and switch the rest on later.

---

## 0. Quick path — flip switches by leverage (from `/api/cmdb`)

Set each in **Vercel → Settings → Environment Variables**, then **Redeploy** (env only applies on a new
deploy). Watch them go green live in **SYS tab → "Connections & wiring"** (or `GET /api/boot`).

| # | Switch | Env var(s) | Lights | Count |
|---|---|---|---|---|
| 1 | **Outbound webhook** — biggest single unlock | `ALERTS_WEBHOOK_URL` (+ `WEBHOOK_SECRET`) | arms · zapier-bus · notify · missed-call · daily-brief · follow-up · estimate-followup · invoice-remind · inventory-reorder · roof-maintenance | **10** |
| 2 | **Data spine** — records the crons + business-audit read | `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel → Storage → KV) | daily brief, all sweep crons, **business-audit** have data to work on | — |
| 3 | **Supabase brain** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + run [`db/SETUP.md`](db/SETUP.md) SQL | memory · wiki · telemetry · command-center · sync · photo · storage · mcp-server | **8** |
| 4 | **Intelligence** | `ANTHROPIC_API_KEY` | the hive/brain · blueprint vision · business-audit memo · all AI | — |

> #1 **delivers**; #2 gives it something to **say**. The sweep crons (daily-brief, follow-up,
> invoice-remind) and the new **business-audit** read records from **Vercel KV** — without KV they
> return `configured:false`, so set #1 **and** #2 together for the outreach/audit loop to actually run.
> Everything below (§1) is the full per-var detail; §5-equivalent extras each light ~1 tool.

## 1. Set environment variables (Vercel → mgsf-field-os → Settings → Environment Variables)

### ESSENTIAL — the engine + brain won't think without these
| Var | What it powers | Get it from |
|---|---|---|
| `ANTHROPIC_API_KEY` | The hive engine (all answers) | console.anthropic.com |
| `SUPABASE_URL` | The brain (memory, events, odometer) | Supabase project → API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Brain write access | Supabase project → API settings |
| `CREW_CODE` | **Security gate — pick any code.** Locks Klyfton AI **and** the data endpoints (`/api/command-center`, `/api/brain-context`) to the crew. **⚠ If unset, they're OPEN to anyone with the URL** (verified 2026-07-27: unset = data served without a code). Crew types it once in the app. | you choose |

> Run `db/schema.sql` once in the Supabase SQL editor first, so the brain tables/views exist.
> **Set `CREW_CODE` before real go-live** — the AI + read endpoints are unauthenticated until you do.

### CORE FEATURES — turn the business functions on
| Var | Unlocks |
|---|---|
| `OPENAI_API_KEY` + `EMBED_MODEL` (`text-embedding-3-small`) | Semantic long-term memory (needs Supabase too) |
| `HUBSPOT_TOKEN` (or `HUBSPOT_API_KEY`) | CRM: leads / jobs |
| `SAM_API_KEY` | GovCon: SAM.gov daily bid scan (free key at sam.gov) |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` + `OWNER_SMS` | SMS alerts to the field / to you |

### ⚡ SPEED-TO-LEAD (missed-call recovery) — highest-ROI switch to flip
Contractors miss 60–80% of calls; a text back within ~1 min converts far better. `api/missed-call.js`
is **already built and tested** (`tests/missed-call.js`, 24 checks) — it only drafts the text and fires
an event; **it never texts a customer on its own** (golden rule). To make it live, wire the send once:
1. Set `ALERTS_WEBHOOK_URL` (your Zapier/Make/n8n hook that actually sends the SMS) — and
   `WEBHOOK_SECRET` to sign it. Without these it stays inert (safe default).
2. In Twilio, on your business line set the **"No Answer / missed call"** action to call
   `GET https://app.machinegunsprayfoam.info/api/missed-call?event=1&phone={{From}}&caller={{CallerName}}`.
   The endpoint drafts the speed-to-lead SMS (business-hours/Sunday aware) + an owner alert and POSTs
   them to your `ALERTS_WEBHOOK_URL`; your flow sends the SMS from `TWILIO_FROM`.
3. (Optional) point the same flow at HubSpot to open a "call back within 5 min" task automatically.
Test: `GET /api/missed-call` (no query) returns the shape; `?event=1&phone=...` returns the draft +
`notified:true` once the webhook is set.

### OPTIONAL — nice-to-have, safe defaults if omitted
| Var | Unlocks / default |
|---|---|
| `KLYFTON_MONTHLY_BUDGET_USD` | Fuel gauge + ATS auto-downshift (without it, ATS stays on full power — zero behavior change) |
| `ATS_TRANSFER_PCT` / `ATS_BATTERY_MODEL` | ATS trip point (`0.80`) / battery model (`claude-haiku-4-5`) |
| `CRON_SECRET` / `AXLE_SECRET` | Gate the scheduler (axle) + cron endpoints |
| `ELEVENLABS_API_KEY` / `_VOICE_ID` / `_MODEL` | Voice output |
| `INFRANODUS_API_KEY` | Knowledge-graph gap analysis |
| `WEBHOOK_SECRET`, `ALERTS_WEBHOOK_URL`, `NOTIFY_WEBHOOK_URL` | Inbound/outbound webhooks |
| `GDRIVE_TOKEN`, `GOOGLE_APPS_SCRIPT_URL`, `PRICING_CSV_URL` | Drive/pricing pulls |

## 2. Merge + deploy
1. Review branch `claude/klyfton-ai-problems-ynhx9f` and merge to `main`.
2. Vercel auto-deploys `main` (~60s). Confirm the deployment is green.
3. Open `app.machinegunsprayfoam.info` → the 3D gearbox boot → enter `CREW_CODE`.

## 3. Known real-world caveats (not bugs)
- **QuickBooks writes are blocked** (subscription lapsed) — reads only until it's renewed.
- The Google **review link** (`g.pe/g.page`) is flagged for Clifton — do not change it in code.
- Live MCP connectors (HubSpot/Drive/etc. in a Claude session) are **not** the same as the
  deployed app's integrations — the app only reaches what its env vars above turn on.

---
*Owner: Clifton · generated from the live code (env vars grepped from `api/*.js`). Not merged to main.*
