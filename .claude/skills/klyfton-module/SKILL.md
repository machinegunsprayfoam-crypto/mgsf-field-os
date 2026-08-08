---
name: klyfton-module
description: The build checklist for adding or changing a backend module in the Klyfton app (mgsf-field-os) — the api/*.js pure-core + gated-live pattern, its test + SUITES registration, env-var docs, and the non-fabrication rules. Load this whenever creating a new api/ endpoint or calculator, wiring an integration, adding a KV/Supabase collection, or when asked to "add a module / new endpoint / new calculator / new tool to Klyfton" or "why is my test not running". For business numbers use mgsf-core; for the whole-app architecture map use mgsf-ai-platform; this is the how-to-build-one-piece-right checklist.
---

# Adding a Klyfton module the right way

Klyfton (mgsf-field-os) is a single-file PWA (`public/index.html`) over Vercel serverless
functions (`api/*.js`, plain `fetch`, no npm). Read `CLAUDE.md` + `PROJECT_MEMORY.md` first.
Every module follows one shape so the app stays honest, testable, and cheap.

## The module pattern (non-negotiable)
1. **Pure core** — keyless, deterministic, **no `Date.now` / `Math.random`** in the pure
   functions (the test sandbox may not have them, and they break determinism). This is where
   the logic lives; it is unit-tested directly. Export the pure fns off `module.exports`.
2. **Gated live layer** — anything needing a key (KV, Supabase, an API) checks its env var
   and, when absent, returns `{configured:false}` (or `{ok:false, reason:"not_configured"}`).
   It is INERT without its key and **never fabricates or throws** — degrade to empty/defaults.
3. **Outward actions are draft-only** — email/SMS/CRM/QBO writes, deletes, binding submissions
   go through the approval gate (`api/act.js`); nothing auto-sends. Present a draft; dispatch
   only on the owner's confirm.
4. **The handler** — a `module.exports = async (req,res) => {...}` with `GET` returning the
   shape/defaults and `POST` doing the work. Gate data endpoints with `require("./guard")`.

## Steps to add one
1. Create `api/xxx.js` (pure core + handler as above). Never invent a number — unknown values
   get an `OWNER INPUT REQUIRED` marker or a "verify" pointer. Prices/rates defer to
   `api/doctrine.js` / DOCTRINE (read them; don't re-hardcode — duplicates drift).
2. Add `tests/xxx.js` (keyless, deterministic; use fixed dates/ids, not the clock) and
   **register it in `tests/run-all.js` SUITES** with a one-line description. A meta-suite
   enforces tests ↔ SUITES 1:1 — an unregistered test SILENTLY never runs.
3. If it reads a new `process.env.X`, document X in `.env.example` (a guard enforces this).
4. If it adds a KV collection, add it to the `COLLECTIONS` list in `api/sync.js` (and the
   Supabase mirror map if it should be queryable). If it adds a SQL object, mirror it in
   `db/` and `db/SETUP.md` (a guard enforces the SQL↔SETUP sync).
5. If Klyfton should be able to CALL it, register it in the tool catalog (`api/tools.js`) —
   an OpenAPI guard checks every catalogued tool has a route.
6. If it needs UI, wire it in `public/index.html` (a frontend-wiring guard checks every
   inline handler resolves and every `switchModule('x')` has a `mod-x` container — no dead
   buttons/nav). Bump the service-worker `CACHE` version in `public/sw.js` when you ship UI.

## The gate (must be green before every commit)
```
node -c api/xxx.js            # parses
node tests/run-all.js         # every suite + every wiring guard, 0 failed
```
Keep it green. Add a test for any new pure logic. Never merge to main without Clifton's OK;
keep the model identifier out of commits/PRs/code (the Co-Authored-By trailer is allowed).

## Reference modules to copy the shape from
- `api/job-cost.js`, `api/break-even.js` — pure calculators (GET shape + POST compute).
- `api/pipeline.js` — pure rail logic feeding other engines; no persistence.
- `api/daily-brief.js`, `api/business-audit.js` — KV-gated read + pure `compose`/`audit` core.
- `api/sync.js` — the KV/Supabase persistence backbone + `COLLECTIONS`.
