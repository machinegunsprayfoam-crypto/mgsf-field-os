# GO-LIVE — flip Klyfton AI on

**Status (verified locally this session):** all 44 `api/*.js` parse, load, and are wired
correctly (klyfton → ats + memory; gearbox → act + memory; axle → gearbox). The boot screen
(the 3D meshing gearbox) → PIN → app flow is intact. `vercel.json` present; `.vercelignore`
clean. **The code works.** What's left is runtime config + deploy — all owner actions below.

Every integration is **gated + graceful**: if a key is absent, that feature is simply OFF
(no crash, no fabrication). So you can go live with the ESSENTIALS and switch the rest on later.

---

## 1. Set environment variables (Vercel → mgsf-field-os → Settings → Environment Variables)

### ESSENTIAL — the engine + brain won't think without these
| Var | What it powers | Get it from |
|---|---|---|
| `ANTHROPIC_API_KEY` | The hive engine (all answers) | console.anthropic.com |
| `SUPABASE_URL` | The brain (memory, events, odometer) | Supabase project → API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Brain write access | Supabase project → API settings |
| `CREW_CODE` | App PIN gate (pick any code; if unset, no PIN) | you choose |

> Run `db/schema.sql` once in the Supabase SQL editor first, so the brain tables/views exist.

### CORE FEATURES — turn the business functions on
| Var | Unlocks |
|---|---|
| `OPENAI_API_KEY` + `EMBED_MODEL` (`text-embedding-3-small`) | Semantic long-term memory (needs Supabase too) |
| `HUBSPOT_TOKEN` (or `HUBSPOT_API_KEY`) | CRM: leads / jobs |
| `SAM_API_KEY` | GovCon: SAM.gov daily bid scan (free key at sam.gov) |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` + `OWNER_SMS` | SMS alerts to the field / to you |

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
