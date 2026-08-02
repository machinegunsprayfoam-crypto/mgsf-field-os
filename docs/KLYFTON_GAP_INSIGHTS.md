# Klyfton Brain — InfraNodus Knowledge-Graph Insights

_Date: 2026-07-27 · Branch: `claude/klyfton-ai-problems-ynhx9f` · Source: InfraNodus `generate_knowledge_graph`
on the whole-brain corpus (`/home/user/KLYFTON_CORPUS.md`). This is the graph-based scan Clifton asked
for — it complements the static-wiring `FRONTEND_BACKEND_GAP_ANALYSIS.md`. The captured graph is also
now the app's 3D boot screen (`public/brain-graph.js` → `startBootGears`)._

## Graph shape (healthy)
- **150 concepts, 513 links, 11 topical clusters.** Modularity **0.65** — InfraNodus rates the structure
  **"diversified / high"**: the brain is well-organized into distinct regions, not collapsed onto one topic.
- **The 11 regions** (the coloured lobes on the boot screen): Cost Doctrine, Engineering/SEER, Spray System,
  Knowledge Stance, Action Approval, Revenue Connection, Guarantee/Saving guardrails, Procurement &
  Equipment, Estimate Capability, Credential Binding, Safety Condition.
- **Conceptual gateways** (the concepts that hold the whole graph together): `seer, locked, roi, product,
  engineering, spec, approval, money`. These are the load-bearing ideas — keep them accurate; they're where
  the brain's reasoning pivots.

## Structural gaps (under-connected topic pairs = blind spots to bridge)
InfraNodus flags three places where two regions are discussed but poorly linked — the graph equivalent of
"good rooms, missing hallways":

1. **Spray System → Action Approval.** The technical/spray knowledge isn't well tied to the gated
   outward-action layer. ⇒ *Same finding as the manual analysis:* the calculators/technical modules aren't
   wired into the arms/approval pipeline (`act.js`). Bridging = when the brain reasons about a spray/job, it
   should flow into a gated, draftable action, not dead-end.
2. **Spray System → Credential Binding.** Technical reasoning is siloed from the hard-rule layer (binding,
   irreversible, Sunday, credentials). ⇒ Tie job/technical decisions explicitly to the guardrails that gate them.
3. **Guarantee/Saving guardrails → Credential Binding.** The two *compliance* clusters (never-guarantee-
   savings / never-claim-mold / label-estimated **and** credentials/binding/irreversible) are under-linked.
   ⇒ Unify them into one coherent "compliance & gates" doctrine so the brain applies them together.

## What this means (decision-ready)
- The brain's **knowledge** is broad and well-structured (0.65 modularity). The weakness is **connective
  tissue between the technical layer and the action/guardrail layers** — exactly the "wire every module to
  the brain" goal in the corpus. This is an architecture/wiring task (the gearbox/event-mesh idea in
  PROJECT_MEMORY), not a knowledge gap.
- Concrete, safe next steps (all owner-gated / bigger builds — flagged, not auto-done): route estimator/
  technical outputs through `act.js` gated drafts; fold the two guardrail clusters into a single doctrine
  block; keep the gateway concepts (roi, spec, approval, money) tight since the brain pivots on them.

## Cross-reference
- Static wiring view: [`FRONTEND_BACKEND_GAP_ANALYSIS.md`](FRONTEND_BACKEND_GAP_ANALYSIS.md)
- Boot-screen graph data: [`public/brain-graph.json`](public/brain-graph.json) · loader in `public/index.html` (`startBootGears`)
- Corpus: `/home/user/KLYFTON_CORPUS.md` · build state: [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md)

_Findings + a visualization — no brain/doctrine code was changed. Not merged to main._
