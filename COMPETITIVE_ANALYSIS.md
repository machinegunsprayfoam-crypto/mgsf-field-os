# AI Competitor Scan & "Best-Of" Incorporation Plan — Klyfton AI

Scope: the lane Klyfton actually competes in — AI multi-agent / business-ops platforms,
multi-agent builder frameworks, vertical AI for contractors/field-service, and general AI
assistants. Goal: take the best capability from each and fold it into Klyfton.

**Grounding:** every product below was researched via live web search (July 2026) with source
links. Most vendor sites bot-block direct fetch, so **all dollar figures are third-party /
demo-gated and marked directional — re-verify before quoting.** Nothing here is fabricated;
uncertain items are flagged.

---

## 1. "AI army of agents" for founders/SMBs
| Product | What it is | The one thing worth stealing |
|---|---|---|
| **Mindra** (mindra.co) | Spins up a whole "department" of specialist agents from a plain-language prompt; self-healing; governance + approval gates | **Approval gate on sensitive actions** + self-healing retry (matches our "never auto-send") |
| **Lindy** (lindy.ai) | No-code AI "employees"; flagship = email triage; browser "computer use" | **Voice-cloned email drafting + "flag what needs a human" triage.** Caution: users report credit-overage bill shock → meter/cap our spend |
| **Cassidy** (cassidyai.com) | Agents grounded in *your* company knowledge base; model-agnostic | **KB-grounded RFP/proposal drafting** (fits GovCon agent) |
| **Athena** (athena.com) | Human EA + AI **playbook library** | **Playbook library** — capture Clifton's repeatable decisions as versioned playbooks |
| **Ninja AI** (myninja.ai) | Multi-model "super agent"; parallel tasks | **Parallel-task execution + per-model routing under one budget** |
| **Artisan / Ava** (artisan.co) | AI BDR that runs outbound end-to-end | **Email deliverability: warmup + sender-reputation monitoring** |
| **11x / Julian** (11x.ai) | Alice (outbound SDR) + **Julian (inbound voice)** | **Inbound-voice qualifier** — answer calls in seconds, qualify, route hot leads |
| **Relay.app** (relay.app) | Visual builder w/ human-in-the-loop as a first-class node | **Approval-gate node** the router inserts before any billing/email/QBO write |

## 2. Multi-agent builder platforms / frameworks
| Product | The one thing worth stealing |
|---|---|
| **Relevance AI** | **Built-in eval suite** (scenario tests + A/B) — regression-test the estimator vs locked doctrine before deploy |
| **Lyzr** | **Agent versioning + traceable logs** — audit which doctrine version produced an estimate |
| **Stack AI** | **PII redaction + guardrail gate** before any LLM call (matches "never leak secrets") |
| **Gumloop** | **Step-level sandbox testing** — dry-run an agent on a real lead, inspect each step before it sends |
| **Beam AI** | **Self-healing outputs** — critic re-runs the worker with the failure reason until it passes the gate |
| **Cognosys** | ⚠️ Reportedly acquired/sunset (Ottogrid → Cohere). **Do not build on it.** |
| **MindStudio** | **Multiple models within one workflow** (cheap model for intake, top model for estimator/critic) |
| **CrewAI** (OSS) | Hierarchical manager→worker = **validates our Queen→worker pattern**; study its Flows state-passing |
| **AutoGen** (OSS) | **Human-in-the-loop mid-run** — agent pauses to ask Clifton, not just at the end |
| **LangGraph** (OSS) | **★ Durable checkpointing + rewind** — persist every run, let Clifton pause/edit/approve/rewind a node |

## 3. Vertical AI for contractors / field service (most relevant to MGSF)
| Product | The one thing worth stealing |
|---|---|
| **Hatch** (Yelp, acq. Jan 2026) | **Unsold-estimate re-engagement** + speed-to-lead auto-response (reheats dead quotes) |
| **Avoca AI** | **Missed-call auto-recovery** — every missed call fires an automatic text/callback |
| **Bland AI** | **Branching voice "Pathways"** for after-hours booking; per-minute economics beat per-seat |
| **ServiceTitan / Atlas** | **Conversational plain-English ops** — "who's free Thursday near Sidney, dispatch them" |
| **Jobber Copilot** | **Coach persona over your own data** — proactively surfaces margin/cash-flow anomalies |
| **Handoff (by 1build)** | **★ Estimate-from-photos/description + localized live material cost** (keep mgsf-core pricing as truth) |
| **Kreo** | AI takeoffs from blueprints (~$35/mo entry) — reference for a takeoff step |
| **Rilla** | Record + auto-analyze the in-home sales visit for objection data (high price = build-not-buy) |
| **Housecall Pro** | **Review/reputation automation** (auto-request reviews post-job) — cheap local-SEO win |

## 4. General AI assistants (a feature idea each)
| Product | The one thing worth stealing |
|---|---|
| **Claude (MCP)** | **MCP as the universal connector layer** — new integrations become plug-in, not custom code |
| **ChatGPT Agent/Tasks** | **Change-monitoring scheduled tasks** (event triggers, not just cron) — daily brief + SAM/Tango watch |
| **Copilot Studio** | **Per-action cost ledger** — numbers-first spend transparency per agent |
| **Manus** | **"Wide Research" fan-out** — spin up parallel sub-agents for one big task (bid-package research) |
| **Perplexity Spaces** | **Space-scoped context** per lane (foam / concrete / GovCon) that auto-applies + searches web + brain |
| **Notion AI** | **Action-item extraction from call transcripts** → tasks/estimates into the dashboard |
| **Zapier Agents** | **Agent-to-agent delegation** — a worker spawns a specialist mid-task |
| **n8n** | **BYO-model, execution-priced economics** — pay only your API tokens + a flat host (no per-seat) |

---

## Best-of "steal list" — ranked by value to MGSF, with build effort
| # | Capability | Best-in-class | Effort | Fits which Klyfton agent |
|---|---|---|---|---|
| 1 | **Missed-call auto-recovery + speed-to-lead SMS** | Avoca, Hatch | Low–Med | Lead Intake + Scheduler |
| 2 | **Inbound AI voice qualifier / after-hours booking** | 11x Julian, Avoca, Bland | Med–High | Lead Intake (new voice channel) |
| 3 | **Unsold-estimate re-engagement sequences** | Hatch | Low–Med | Estimator + Email |
| 4 | **Estimate-from-photo + localized material lookup** | Handoff, Kreo | Med | Estimator |
| 5 | **Human approval gate as a first-class node** | Relay, AutoGen, Mindra | Low | Queen router (all outward actions) |
| 6 | **Self-healing critic retry loop** | Beam | Med | Critic/synthesizer |
| 7 | **Per-agent cost ledger + cheapest-capable routing** | Copilot Studio, Ninja | Low | Queen (already ~half done: cost is now logged) |
| 8 | **Review/reputation automation** | Housecall | Low | Marketing |
| 9 | **Eval/regression harness vs locked doctrine** | Relevance | Med | Estimator (pre-deploy) |
| 10 | **Durable checkpoint + rewind** | LangGraph | High | Whole hive (agent_runs is step 1) |
| 11 | **Change-monitoring scheduled tasks** | ChatGPT, Manus | Med | Daily Brief + GovCon watch |
| 12 | **PII redaction/guardrail before LLM** | Stack AI | Low–Med | Queen (pre-processing) |
| 13 | **Playbook library (versioned decisions)** | Athena | Med | Doctrine/brain |
| 14 | **MCP universal connector layer** | Claude | Med–High | All workers |
| 15 | **Email deliverability warmup** | Artisan | Med | Email/Marketing |

## Klyfton — ahead vs. gaps
**Already ahead / at parity** (don't rebuild):
- Multi-agent Queen→Worker→Critic (= CrewAI hierarchical, Manus fan-out, Zapier a2a).
- Vendor-neutral model routing — Haiku router + Sonnet workers (= Cassidy/MindStudio).
- Cost metering + monthly cap, and now **per-run cost logged** (= Copilot Studio) — Command Center Phase 1.
- Grounded in MGSF's own doctrine + Supabase brain (= Cassidy KB grounding).
- Fabrication-killing critic/synthesizer.
- **Vertical fit** — contractor doctrine (locked pricing, GM targets, gates) baked in. This *beats* every horizontal platform for MGSF.
- **No per-seat SaaS bill** — self-hosted on Vercel/Supabase, pay only API tokens (= n8n economics).

**Real gaps** (the build list, in priority order): voice channel · missed-call/speed-to-lead SMS ·
unsold-estimate re-engagement · estimate-from-photo pipeline · self-healing critic retry ·
durable checkpoint/rewind · eval harness · explicit PII gate · review automation.

## Recommended sequence
1. **Now (done this pass):** fold the best *operating principles* into the brain (approval gate,
   self-check, cost-aware, grounded, auditable) — see the `COMPETITIVE_EDGE` block in `api/klyfton.js`.
2. **Cheapest revenue wins next:** #1 missed-call recovery + #3 unsold-estimate re-engagement
   (build on existing SMS/email/scheduler agents).
3. **Biggest lever:** #4 estimate-from-photo (Estimator) and #2 inbound voice (needs Bland/Twilio).
4. **Robustness:** #6 self-healing critic + #10 checkpoint/rewind (agent_runs already lays the track).

## Sources (representative — full URLs in the research log)
mindra.co · lindy.ai · cassidyai.com · athena.com · myninja.ai · artisan.co · 11x.ai · relay.app ·
relevance.ai · lyzr.ai · stack-ai.com · gumloop.com · beam.ai · mindstudio.ai · crewai.com ·
microsoft.github.io/autogen · langchain.com/langgraph · usehatchapp.com · bland.ai · servicetitan.com ·
getjobber.com · handoff.ai · kreo.net · rilla.com · avoca.ai · housecallpro.com · anthropic.com (MCP) ·
openai.com · microsoft.com (Copilot Studio) · manus.im · perplexity.ai · notion.so · zapier.com · n8n.io

## Cross-references
- [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md) · [`api/klyfton.js`](api/klyfton.js) · [`CLAUDE.md`](CLAUDE.md)
