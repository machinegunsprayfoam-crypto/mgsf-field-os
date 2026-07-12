# MGSF FieldOS

Private business operating system for **Machine Gun Spray Foam & Concrete Lifting LLC**.

Owner: Clifton Behner  
Website: https://app.machinegunsprayfoam.info  
Service region: Montana, Wyoming, North Dakota, South Dakota

---

## What this is

A single-file progressive web app (`public/index.html`) backed by Vercel serverless functions in `/api/`.
It runs fully on-device with no cloud storage required — every cloud feature degrades gracefully
when the corresponding env var is missing.

---

## Quick setup

### 1 — Deploy to Vercel

The repo auto-deploys `main` → the `mgsf-fieldos` Vercel project.
No build step needed (`buildCommand: "mkdir -p public"`).

### 2 — Set environment variables

Copy `.env.example` to `.env.local` for local dev.  
In Vercel → mgsf-fieldos → Settings → Environment Variables, set:

| Variable | Purpose | Required for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Lead/equipment/inventory data |
| `SUPABASE_SERVICE_KEY` | Service-role key (server-only) | All Supabase API calls |
| `ALERTS_WEBHOOK_URL` | Zapier/Make/Twilio catch-hook | Push alerts (funnel, assets) |
| `ANTHROPIC_API_KEY` | Claude API key | Klyfton AI assistant |
| `CREW_CODE` | Optional passcode for Klyfton | Crew access control |
| `HUBSPOT_TOKEN` | HubSpot private-app token | Call list + CRM logging |
| `STRIPE_SECRET_KEY` | Stripe secret key | Deposit checkout links |
| `FUNNEL_REMIND_SECRET` / `CRON_SECRET` | Auth for cron requests | Secure cron endpoint |
| `KV_REST_API_URL` + `KV_REST_API_TOKEN` | Upstash/Vercel KV | Multi-device sync + photos |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | GCP service account JSON | Google Drive folder creation |
| `GOOGLE_DRIVE_PARENT_ID` | Drive parent folder ID | Google Drive folder creation |

### 3 — Apply the Supabase schema

In the Supabase dashboard → SQL Editor, run `supabase/schema.sql`.
This is idempotent — safe to run again after updates.

### 4 — Daily cron alerts (automated)

Vercel Cron is already configured in `vercel.json` to fire at **14:00 UTC (8 AM MT)** daily:

| Path | What it does |
|---|---|
| `POST /api/funnel-remind` | Finds leads with overdue follow-up dates, fires `ALERTS_WEBHOOK_URL` |
| `POST /api/asset-alert` | Finds equipment due for service + low-inventory items, fires `ALERTS_WEBHOOK_URL` |

Both endpoints also accept `GET` so Vercel Cron works without a body.  
To secure cron requests: set `CRON_SECRET` in Vercel env vars and set `FUNNEL_REMIND_SECRET` to the same value.

Alternatively, point Zapier / Make at these endpoints on a daily schedule.

---

## API reference

All functions live in `/api/` and are deployed as Vercel serverless functions.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ai` | POST | Klyfton AI — parse job, takeoff, ROI, narrative |
| `/api/hubspot` | POST | HubSpot call list + log-call |
| `/api/stripe` | POST | Generate Stripe Checkout deposit link |
| `/api/notify` | POST | Fire alert webhook (new lead, etc.) |
| `/api/sync` | GET/POST | Multi-device KV data sync |
| `/api/photo` | GET/POST | Multi-device photo sync via KV |
| `/api/drive` | POST | Create Google Drive job folder |
| `/api/funnel-remind` | GET/POST | Stale-lead follow-up alerts |
| `/api/asset-alert` | GET/POST | Equipment + inventory alerts |
| `/api/klyfton` | POST | Klyfton "Hive" multi-model AI |

All endpoints:
- Return `{ configured: false }` when required env vars are missing (no crashes).
- Send CORS headers for `machinegunsprayfoam.info`, `*.vercel.app`, and `localhost`.
- Reject non-allowed methods with `405`.

---

## Core services

- Spray foam insulation
- Commercial SPF roofing systems
- Roof coatings
- Concrete lifting and leveling
- Void filling
- Soil stabilization
- Polyurea coatings
- Building performance services

---

## Repo structure

```text
/api/          Vercel serverless functions (no npm deps — native fetch only)
/public/       Static app (index.html = main app, lead.html = public lead form)
/supabase/     Supabase schema SQL (run once in SQL Editor)
/docs/         Business process documents and SOPs
/data/         Schemas, templates, and non-sensitive operating data
```

---

## Rules

1. Do not commit passwords, API keys, EIN, bank info, customer private data, or medical data.
2. Put private business identifiers in a secure vault, not in this repo.
3. Every automation should have a plain-English SOP before code is added.
4. Every estimating formula must show assumptions.
5. Every customer-facing proposal must be reviewed before sending.
