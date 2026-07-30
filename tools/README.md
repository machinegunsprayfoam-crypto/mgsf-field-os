# tools/ — maintenance scripts (dependency-free)

Small Python 3 scripts for keeping the Klyfton app healthy. Run from the **repo root**.

## `doctrine_reconcile.py` — "same brain, two bodies" drift check

MGSF's locked numbers live in two places that don't auto-share: the **mgsf-core**
Agent Skill (`SKILL.md`, the source of truth for Claude AI skills) and the **DOCTRINE**
block inside `api/klyfton.js`. Edit one and the other silently drifts — then the skill
and the app quote different prices/margins. This tool extracts the locked constants
from both and diffs them side-by-side.

```bash
python3 tools/doctrine_reconcile.py
python3 tools/doctrine_reconcile.py --core /path/to/mgsf-core/SKILL.md --klyfton api/klyfton.js
```

- Reads **only** the authoritative regions — core's whole `SKILL.md` and klyfton's
  `const DOCTRINE = \`…\`` literal — so it can't grab an unrelated number from elsewhere
  in the app file (e.g. the product-line GM targets in another block).
- Patterns are case-insensitive and anchored; decimals won't swallow a trailing period.
- Covers: OC / CC 2.8# / SPF-roofing 3.0# $/BF, installer & helper $/hr, concrete /
  void / polyurea / coating prices, GM % (res/comm/ind/gov), MT/ND/SD/WY multipliers,
  job minimum, and soil-stab status (BLOCKED|OFFERED|PENDING).
- **Exit 0** = every checked constant matches · **1** = a mismatch or present-in-one ·
  **2** = a file/parse problem (CI-friendly). It **never edits** — mgsf-core wins; a
  human reconciles flagged items.

**Known, documented drift it will flag:** soil-stab status — klyfton has it `OFFERED`
(owner-activated), mgsf-core still says `BLOCKED`. That's expected and tracked as an
owner to-do (update mgsf-core); every other constant should read `ok`.

Run it after touching either the DOCTRINE block or mgsf-core, and before merging a
pricing/doctrine change.
