# MGSF FieldOS — Klyfton AI

Private business operating system for **Machine Gun Spray Foam & Concrete Lifting LLC**, powered by the Klyfton AI multi-agent platform.

Owner: Clifton Behner  
App: https://app.machinegunsprayfoam.info  
Website: https://www.machinegunsprayfoam.info  
Service region: Montana, Wyoming, North Dakota, South Dakota

## What this is

Klyfton AI is the single operational platform for MGSF — lead qualification, estimating, project management, invoicing, scheduling, government contracting, and business automation in one place. The frontend is a single-file PWA; the backend is a set of Vercel serverless functions; the brain is Claude AI. See [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) for current build state.

## Core services

- Spray foam insulation
- Commercial SPF roofing systems
- Roof coatings
- Concrete lifting and leveling
- Void filling
- Soil stabilization
- Polyurea coatings
- Building performance services

## Repo structure

```text
api/                   ~90 Vercel serverless functions (the app's backend + AI brains)
public/                Single-file PWA (index.html), CSS, brain-graph viz, portal, service worker
db/                    Supabase schema SQL files and wiki seed data
docs/                  Architecture notes, SOPs, and spec documents
lib/                   Shared pure helpers (pdf.js)
tests/                 Test suites — run with: node tests/run-all.js
tools/                 Dev utilities (UI QA sweep, doctrine reconciler)
google-apps-script/    Google Drive backup Apps Script + setup guide
data/                  Schemas and non-sensitive reference data
.github/               CI workflows
vercel.json            Vercel config (functions, cron schedules)
PROJECT_MEMORY.md      Single source of truth — read this first every session
CLAUDE.md              AI session-start protocol
```

## Running the tests

```bash
node tests/run-all.js
```

All tests are keyless and run offline. Exit 0 = all green.

## Deployment

Auto-deploys to Vercel from `main`. Branch work stays on feature branches until Clifton approves a merge. Environment variables (API keys, webhook URLs, secrets) live in Vercel Settings → Environment Variables — never in the repo.

## Rules

1. Do not commit passwords, API keys, EIN, bank info, customer private data, medical data, or private documents.
2. Put private business identifiers in Google Drive or a secure vault, not in code.
3. Every outward action (email, SMS, invoice, CRM write) requires `approved:true` — never fires autonomously.
4. Every estimating formula must show assumptions; pricing doctrine in `mgsf-core.skill` wins over everything.
5. Every customer-facing proposal must be reviewed before sending.
