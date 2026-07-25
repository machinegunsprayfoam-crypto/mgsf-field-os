# Klyfton Capabilities — matrix vs. the AI field + what to add

Capability-level scan (July 2026, cited): what abilities the leading AI agent/assistant/contractor
platforms have, mapped against what Klyfton **already ships**, is **partial**, or is a **gap** —
then a ranked "add to the build" list. Legend: ✓ have · ◐ partial · ✗ gap.

**Grounding:** competitor abilities from live web search; Klyfton status read from `api/*.js`.
No fabricated features or prices. Sources at the bottom.

## Capability matrix

### Perception / input
| Ability | Klyfton | Notes |
|---|---|---|
| Text chat | ✓ | Queen→worker→critic hive |
| Vision / photo understanding | ◐ | workers accept image+PDF attachments (`buildUserContent`); no dedicated pipeline |
| Document OCR → structured data | ◐ | PDFs read as attachments; no structured extraction (field: 90%+ OCR accuracy) |
| Voice **input** / transcription (STT) | ✗ | biggest gap — no telephony/STT |
| Multilingual | ◐ | model-native; not configured (field: 70+ languages in voice) |

### Reasoning / orchestration
| Ability | Klyfton | Notes |
|---|---|---|
| Multi-agent routing + parallel workers | ✓ | strong — matches CrewAI/AutoGen hierarchical |
| Plan / decompose | ✓ | Queen router |
| Self-healing retry (re-run on failure, fallback model) | ✗ | critic flags but doesn't re-run the worker (Beam does) |
| Human-in-the-loop **mid-run** | ◐ | drafts-for-approval, but can't pause mid-run to ask |
| Agent-to-agent delegation | ✗ | everything routes back through the Queen (Zapier a2a) |

### Memory / knowledge
| Ability | Klyfton | Notes |
|---|---|---|
| Persistent memory | ✓ | `[[MEMORY]]` blocks + `memory` table (Supabase) |
| Doctrine/KB grounding | ✓ | brain blocks + mgsf-core; MCP read server (`api/mcp.js`) |
| Vector / semantic RAG | ✗ | memory is note-based, not embedded/retrieved (field: adaptive multimodal RAG) |
| Knowledge-graph memory | ◐ | `api/infranodus.js` does gap analysis, not live memory |

### Action / output
| Ability | Klyfton | Notes |
|---|---|---|
| Tool use / function calling | ✓ | web tool + many `api/` endpoints |
| Web search | ✓ | `WEB_TOOL` |
| Document generation (PDF/proposal/cert) | ✓ | `proposal-pdf`, `capability-statement`, `warranty-cert` |
| Voice **output** (TTS) | ✓ | `api/tts.js` (ElevenLabs/OpenAI) |
| Email/SMS **send** | ◐ | drafts + `notify.js` webhook → Zapier/Twilio/n8n (human fires) |
| Review-request automation | ✓ | `api/reviews.js` (draft SMS+email after job) |
| Follow-up / no-lead-cold sequencer | ✓ | `api/follow-up.js` (drafts nudges for quiet leads) |
| Recurring-revenue (roof maintenance) | ✓ | `api/roof-maintenance.js` |
| Image generation | ✗ | none in core (field: QuoteIQ, Grok) |
| Browser / computer use | ✗ | none (field: Lindy, ChatGPT Operator) |
| Inbound **voice calls** / booking | ✗ | **top gap** — where contractors lose the most leads |

### Trust / ops
| Ability | Klyfton | Notes |
|---|---|---|
| Cost metering + budget cap | ✓ | `meter` + monthly cap |
| Per-run telemetry / audit | ✓ | `agent_runs` (Command Center Phase 1) |
| Cheapest-capable model routing | ◐ | Haiku router + Sonnet workers; not per-task dynamic |
| Observability tracing (tool calls/reasoning) | ◐ | console logs + agent_runs; not OTel spans |
| Guardrails / PII redaction gate | ✗ | doctrine rules only, no code gate (Stack AI) |
| Eval / regression harness | ✗ | none (Relevance) |

### Contractor-specific
| Ability | Klyfton | Notes |
|---|---|---|
| Estimating engine | ✓ | `foam-calc`, `coating-calc`, `job-cost`, `pricing`, `measure` |
| **Estimate-from-photo** (stitched flow) | ◐ | pieces exist (photo + measure + calc) but not one pipeline |
| **Missed-call auto-recovery** | ✗ | plumbing exists (`notify.js` + `follow-up.js`), not wired |
| Unsold-estimate re-engagement | ◐ | `follow-up.js` covers quiet leads; not estimate-specific |
| Sentiment analysis | ✗ | none (Zoho Zia) |
| Job-value predictor | ✗ | none (ServiceTitan) |

## "Add to the build" — ranked (#1–#4 BUILT 2026-07-25)
| # | Capability to add | Builds on (cheap because…) | Effort | Status |
|---|---|---|---|---|
| 1 | **Missed-call auto-recovery** (missed call → auto text/callback draft) | `notify.js` webhook + `follow-up.js` pattern | Low | ✅ BUILT — `api/missed-call.js` |
| 2 | **Estimate-from-photo pipeline** (photo → measure → foam/coating calc → draft estimate) | `photo.js` + `measure.js` + `foam-calc`/`coating-calc` | Med | ✅ BUILT — `api/photo-estimate.js` |
| 3 | **Unsold-estimate re-engagement** (reheat quotes that didn't close) | extend `follow-up.js` to estimates | Low–Med | ✅ BUILT — `api/estimate-followup.js` |
| 4 | **Self-healing critic retry** (re-run worker on empty/error, bounded) | the existing critic in `klyfton.js` | Med | ✅ BUILT — `runMindResilient` |
| 5 | **Inbound voice agent** (answer/qualify/book after-hours) | `tts.js` + `notify.js` + Bland/Twilio + STT | **Med–High** | next up — needs telephony vendor + budget |
| 6 | **PII redaction / guardrail gate** before LLM calls | new pre-processor in `klyfton.js` | **Low–Med** | matches "never leak secrets"; cheap insurance |
| 7 | **Vector RAG over the brain + CSVs** (semantic retrieval, not just notes) | Supabase `pgvector` + `mcp.js` | **Med** | adaptive retrieval; better grounding at scale |
| 8 | **Eval/regression harness** (test estimator vs locked doctrine before deploy) | node test rig like MGSF's gate | **Med** | Relevance-style; protects pricing correctness |
| 9 | **Job-value predictor / sentiment** on leads | `agent_runs` + leads data | **Med** | ServiceTitan/Zoho signal; prioritize hot leads |
| 10 | **Image generation** (before/after, ad creative) | Gemini/OpenAI image API, gated | **Low–Med** | marketing agent; QuoteIQ/Grok parity |

## Recommendation
Start with **#1 + #3** (missed-call recovery + unsold-estimate re-engagement) — **low effort because the
webhook + follow-up plumbing already exists**, and they directly recover revenue. Then **#2
estimate-from-photo** (biggest capability leap, stitches parts we already have). **#5 voice** is the
flashiest but needs a telephony vendor + budget — schedule it after the cheap wins land.

Everything stays draft-for-approval (doctrine), numbers defer to mgsf-core, nothing merges to main
without your OK.

## Sources
mem0.ai (agent memory) · turingpost.com (RAG types) · rahulkolekar.com (multimodal agents) ·
vectorize.io (memory systems) · retellai.com / thoughtly.com / leadtruffle.co / gosameday.com (contractor voice AI) ·
myquoteiq.com (QuoteIQ photo estimating) · ortemtech.com / superannotate.com / keerok.tech (multimodal + OCR) ·
confident-ai.com / braintrust.dev / redis.io (observability, self-healing, guardrails) ·
andriifurmanets.com (agents: tools/memory/evals/guardrails)

## Cross-references
- [`COMPETITIVE_ANALYSIS.md`](COMPETITIVE_ANALYSIS.md) · [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md) · [`api/klyfton.js`](api/klyfton.js) · [`CLAUDE.md`](CLAUDE.md)
