# BPI / home-energy-audit software — landscape + best-of synthesis (our own build)

Research (Aug 2026) behind Klyfton's home-energy-audit build (`api/energy-audit.js` + the 🏠 BPI panel).
Goal: take the best of each tool and build MGSF's own fast, sales-grade audit — without re-building a
certified BPI-2400 modeling engine (buy that when a rebate program requires it).

## The tools
| Tool | What it's best at | BPI-2400 |
|---|---|---|
| **Snugg Pro** (Franklin Energy) | Fast whole-home audit, HPXML export, AI-assisted entry, beautiful homeowner reports, recommendation library, Health & Safety section. Category leader for compliance reporting. | ✅ approved |
| **OptiMiser (Zeus)** | The bill-calibration engine that powers Snugg Pro; CAZ combustion wizard; design loads (Manual J); the deep **measures catalog with per-measure incentives** (the "Imp" tab Clifton showed). | ✅ approved |
| **Clarity HPTK** | Single-family modeling for the HOMES rebate program. | ✅ approved |
| **DOE Weatherization Assistant — NEAT / MHEA / MulTEA + H&S Audit** | Free (ORNL). **Prioritized, cost-effective measure list ranked by SIR (savings-to-investment)**; billing adjustment (bill calibration); work orders; health & safety audit. | modeling std |
| **REM/Rate, Ekotrope** | HERS / RESNET rating rigor; input-to-report documentation. | HERS |
| **DOE Home Energy Score** | Standardized 1–10 asset score. | — |

## Best-of we adopted (built into Klyfton)
- **Comprehensive measures catalog** (OptiMiser "Imp" tab) → `MEASURE_CATALOG` (~37 measures across envelope /
  mechanical / DHW / ventilation / health-safety / appliance / renewable), with the MGSF-lane measures
  (foam / air-seal / insulation) flagged `mgsf:true`.
- **Per-measure incentive/rebate (%/$ + cap)** → `applyIncentive()`; optional program-wide cap → `programCap`.
  All $ are OWNER-ENTERED per job — never MGSF doctrine pricing, never fabricated.
- **Cost-effectiveness prioritization (NEAT/MHEA)** → `prioritize()` ranks measures by net-cost-per-unit-
  energy-saved (lower = better); unscored measures fall to the end.
- **Bill-based baseline / disaggregation** (all tools) → already in `analyzeFuel()` (summer-minimum split,
  optional HDD weather-normalization). Sales-grade ESTIMATE, not a certified BPI-2400 calibrated model.
- **Health & Safety / CAZ combustion flag** (Snugg/OptiMiser/WAP) → `concernsToMeasures()` + top-level `safetyFlag`.
- **Homeowner concerns → measures** (our own touch) → maps complaints to the catalog's foam measures.

## Deliberately NOT built (buy instead)
- Certified **BPI-2400 bill-calibrated model**, **HPXML export**, **DOE Home Energy Score** — required only for
  rebate/utility programs (IRA HOMES). Subscribe to Snugg Pro / OptiMiser for those; re-building them is
  RESNET-grade, multi-year work and not MGSF's business.

## Roadmap (still open, owner's call)
- **$ savings + SIR/payback** per measure once a utility rate is entered (rate = customer's own, per job).
- **Auditor/program header** fields (auditor, credentials, audit date, program/sponsor) for a formal deliverable.
- **Save-as-proposal/PDF** (wire the result into `api/proposal-pdf.js`).
- **Appliance/lighting baseload detail** + **design loads (Manual J)** if we ever want modeled (not just bill-based) savings.

## Hard rules held throughout
ESTIMATE only · energy savings in units (kWh/therms), no fabricated $ · measure costs/incentives owner-entered,
not MGSF pricing · never guarantee savings · never claim mold elimination · CAZ testing before air-sealing a
combustion home · doctrine (mgsf-core) + the AHJ win.

## Cross-reference
`api/energy-audit.js` · `api/bpi-calc.js` · `db/BPI_REPORT_TEMPLATE.md` · `db/BPI_TOOLING_NOTES.md` ·
skills: `mgsf-blower-door`, `mgsf-building-science`, `mgsf-safety-osha`, `mgsf-core`.
