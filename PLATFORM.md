# MGSF Platform — Single Source of Truth

**Decision (2026-07-22): Klyfton (this repo, `mgsf-field-os`) is THE platform for Machine Gun Spray
Foam & Concrete Lifting, LLC.** All operational build effort goes here. Do not start or revive a
competing platform. Rationale + roadmap: `MGSF_MASTER_PLAN_2026-07-22` (Google Drive).

## Why
The business had **five** half-built software platforms. That fragmentation — split data, duplicated
work, no source of truth — was the single biggest drag on progress. Klyfton is the only one that is
**live, mature (29 modules), and used daily**. Rebuilding it elsewhere is a months-long rewrite of
what already works. So: one platform, finished and automated, beats five in progress.

## Repo map
| Repo | Role | Status |
|---|---|---|
| **mgsf-field-os** (Klyfton) | The platform — CRM, estimator, BPI, GovCon, inventory, invoicing, ops | ⭐ **ACTIVE — build here** |
| **mgsf-marketing** | Public front door: organic homepage (SEO) + $0-down Hearth ads page | ✅ Active (marketing only) |
| **MGCC** | "Command Center" rebuild (TS monorepo, scaffolding) | ⛔ **PARKED** — superseded by Klyfton |
| **mgsf** (MOGS) | Apps Script ERP over Google Sheets | ⛔ **PARKED** — superseded by Klyfton |
| **setup-assistant** | Next.js/v0 onboarding experiment | ⛔ **PARKED** |
| **html-parsing** | Next.js/v0 "MGSF console" experiment | ⛔ **PARKED** |
| **github** | Utility/config | Audit & fold or park |

## What "parked" means
Not deleted — kept in GitHub for reference. Just: **stop investing time.** If a parked repo has one
good idea Klyfton lacks, harvest that single idea into Klyfton and move on. Do not resume building a
parked platform.

## The system Klyfton anchors
1. **Front door** — `mgsf-marketing` (organic SEO homepage + ads page) → local leads.
2. **Command center** — this app (doctrine-locked to `mgsf-core`; the brain lives in `api/klyfton.js`).
3. **Nervous system** — `api/notify.js` event webhook → Zapier → HubSpot / Gmail / Calendar /
   QuickBooks / Slack. Daily crons auto-fire the invoice + inventory sweeps so it runs itself.

## Rule for anyone (human or AI) working here
Build in `mgsf-field-os`. Marketing goes in `mgsf-marketing`. Everything else is parked. Before any
session, run the session-start Drive audit (see `CLAUDE.md`) and reconcile `mgsf-core` doctrine first.

*Owner: Clifton Behner · veteran-owned · one platform, pointed at leads and gov work.*
