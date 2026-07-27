# Klyfton Brain Roadmap — "make it reason more like Claude"

_Date: 2026-07-27 · Branch: `claude/klyfton-ai-problems-ynhx9f` · Grounded in the InfraNodus graph
(`KLYFTON_GAP_INSIGHTS.md`) + the wiring map (`FRONTEND_BACKEND_GAP_ANALYSIS.md`). Not merged to main._

**TL;DR:** The brain's *knowledge* is broad and well-structured (0.65 modularity). What's missing is
**retrieval, live grounding, and connective tissue between layers** — the things that make an assistant
feel like it's *reasoning*, not reciting. #1 is BUILT tonight (engine, keyless, tested). #2–#3 need your
keys or are bigger builds — laid out below with honest effort + what only you can unblock.

---

## ✅ #1 — Retrieval (GraphRAG-lite): BUILT & staged
**Problem:** every knowledge block was stuffed into the prompt as static text — expensive and unfocused.
**Built (no keys, deterministic):**
- `api/brain-graph-data.js` — the real 150-concept graph, Node-requirable.
- `api/brain-graph-retrieve.js` — matches a question to graph concepts (with a domain alias map +
  1-hop edge expansion), scores the 11 clusters, and returns the **knowledge blocks to load** for that
  question. Endpoint `GET/POST /api/brain-retrieve?q=…`. Always keeps identity + guardrails
  (base_voice, DOCTRINE, COMPETITIVE_EDGE); routes the domain blocks on top.
- Verified routing: *"foam for a metal shop + ROI/margin"* → Spray/Cost/Engineering (FOAM_SPECS, ROI,
  ACCOUNTING, HVAC, EQUIPMENT); *"too cold to spray?"* → Spray + Safety; *"SDVOSB on SAM.gov"* →
  Procurement (FEDERAL); *"draft a proposal for approval"* → Action Approval (ACTIONS, PLATFORM).

**Ready-to-flip (your call — it changes tuned brain output + token usage, so validate first):**
wire `retrieve(query).blocks` into klyfton.js's prompt assembly (BOTH builders) to include only the
selected blocks. **Recommended:** run it in *shadow* first — log what it *would* load on real questions,
eyeball the routing for a day, then flip to actually select. That's the safe path; I didn't touch the
live brain unprompted.

## 🔑 #2 — Live-data grounding (needs your keys)
Make it answer from your real numbers, not just doctrine: *"AR is $X, these 3 leads went cold, this
customer paid $Y last time."* The graph flagged this exact gap (assistant ↔ CRM/jobs/money is siloed).
- Build: a read-context aggregator that pulls HubSpot (leads), the KV job/estimate sync, and QBO
  (AR/P&L) into a compact "situation" the brain sees each turn.
- **Blocked on:** HubSpot key (live), Vercel KV binding, QBO (subscription lapsed). I can build the
  gated module scaffolding now (returns `not_configured` until keyed) if you want it staged — say so.
- Effort: medium once keyed.

## 🔧 #3 — Wire the layers + go proactive (bigger build)
The graph's structural gaps = **technical → action → guardrail are siloed** ("good rooms, missing
hallways"). Two parts:
- **Mesh:** finish the gearbox/event bus (`api/gearbox.js` exists) so work chains — estimate → gated
  proposal → schedule → invoice — instead of answer-and-stop.
- **Proactive:** the axle/scheduler (`api/axle.js` exists) surfaces things unprompted — a morning brief
  that *reasons over the day's data*, not a template; watch-and-alert on cold leads, cert expiry, weather.
- Effort: bigger; needs your go on scope. Mostly code (some pieces need #2's data).

## Smaller adds (in "feels like Claude" order)
- **Use memory every turn** — pgvector recall exists; embeddings need `OPENAI_API_KEY` (keyless degrades to note-recall).
- **Self-check / eval harness** — ✅ **BUILT** (`tests/calc-invariants.js`, `node tests/calc-invariants.js`,
  40/40 passing): asserts every calculator's internal math identities + monotonicity (foam board-feet &
  sets, coating gallons, job-cost buildup & margin, ROI payback/horizon, roof geometry, BPI ACH50, dew
  point). No hardcoded doctrine prices — it catches *math* regressions, exits non-zero on drift. Keyless.
- **Vision + docs** — read job photos / plans / PDFs (photo-estimate is the seed). Needs a vision-capable key.
- **Voice / telephony** — hands-free for the crew, inbound-call handling. Needs a telephony + STT service.
- **Honesty calibration** — enforce "numbers before the rec, say what's uncertain, ≤2 clarifying Qs" (mostly in the owner profile already).

## Recommended sequence
1. **Validate & flip #1** (shadow → live) — highest payoff, already built. ← your review
2. **#2 live-data grounding** once keys are in (HubSpot + KV first; QBO when the subscription's back).
3. **Self-check harness** (cheap, keyless) alongside.
4. **#3 mesh + proactive** — the big vision build, once 1–2 land.

_What was built tonight touches no pricing, no doctrine numbers, no live brain behavior — it's a new,
tested, opt-in engine + this plan. Not merged to main._
