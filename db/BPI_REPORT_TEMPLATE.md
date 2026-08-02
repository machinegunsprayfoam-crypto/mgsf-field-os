# MGSF BPI / Home Energy Audit Report — template

The structured layout Klyfton fills in to produce a BPI-style report. It has two engines behind it:
- **Diagnostics** → `api/bpi-calc.js` (blower-door CFM50 ↔ ACH50, ASHRAE 62.2 ventilation target, leakage-hole visual).
- **Utility baseline** → `api/energy-audit.js` (12 mo kWh/therms → annualized use, base-load vs seasonal split, optional weather-normalization, ESTIMATE savings — energy units only).

## Hard rules (baked in — never violate)
- Everything modeled is an **ESTIMATE**. **Never guarantee savings.** Never claim mold elimination or removal.
- **No fabricated numbers.** If an input is missing (degree-days, a measure's modeled reduction %, a code minimum), say `OWNER INPUT REQUIRED` — don't guess.
- **No dollars from the engine.** `energy-audit.js` outputs energy units; convert to $ only with the **customer's own utility rate** and label it ESTIMATE.
- **Doctrine wins.** Any MGSF price/spec defers to `mgsf-core`. Code minimums defer to the AHJ / `mgsf-codes-permits`.
- Structural/HVAC-sizing/electrical sign-off → the licensed professional. State it.

## 1. Header
- Customer, address, date, auditor. Job/file #. Primary heating fuel + provider + account (from intake).

## 2. Utility baseline  *(from `energy-audit.js`)*
| Fuel | Annual use | Basis | Base-load / yr | Seasonal / yr | Seasonal % | Weather-normalized |
|---|---|---|---|---|---|---|
| Electric (kWh) | … | measured / ESTIMATE(extrapolated) | … | … | …% | … or "not normalized — HDD needed" |
| Gas (therms) | … | … | … | … | …% | … |
- Combined **site energy ≈ __ MMBtu/yr**.
- Note the disaggregation method (summer-minimum) and that the split is an ESTIMATE, not sub-metered.

## 3. Envelope diagnostics  *(from `bpi-calc.js`)*
- Blower door: **CFM50 __ · ACH50 __** (volume from floor area × ceiling height).
- Tightness band + the "leaks like a __ in² hole" visual.
- **ASHRAE 62.2 ventilation target: __ CFM.** If air-sealing drops the house below the natural infiltration it relies on, **mechanical ventilation may be required** — flag it (see `mgsf-building-science`).

## 4. Findings
- Plain-language observations (envelope, insulation levels vs Zone 6/7 code, moisture/condensation risk, combustion-safety items). Label each **Verified / Estimated / Pending Verification**.

## 5. Recommended measures
For each measure (air-sealing, attic/wall/crawlspace foam, roof recoat, etc.):
- What + why (tie to a finding), the building-science rationale, and the code/safety note.
- **Modeled seasonal-load reduction %** = OWNER INPUT (engineering judgment / modeling) → feeds `estimateSavings`. Never invented.

## 6. Estimated savings  *(ESTIMATE — never a guarantee)*
- Per measure: **estimated energy saved __ kWh or __ therms/yr** (= seasonal load × modeled reduction %).
- Convert to $ **only** with the customer's current rate (from their bill): `$ ≈ units × their_rate`. Label ESTIMATE.
- Payback (optional): use `api/roi.js` with the MGSF quoted price (doctrine) — show the math, label ESTIMATE.
- Standing disclaimer: *"Estimated energy reduction only — actual results vary with weather, occupancy, and usage; not a guarantee of savings."*

## 7. Assumptions & disclaimers
- Degree-days source (or `OWNER INPUT REQUIRED`), climate zone, base temperature, occupancy assumptions.
- Not a code ruling; verify with the AHJ. Health/mold claims excluded. Prices per MGSF doctrine + signed proposal.

## Cross-reference
- `api/energy-audit.js` · `api/bpi-calc.js` · `api/roi.js` · skills: `mgsf-blower-door`, `mgsf-building-science`, `mgsf-codes-permits`, `mgsf-core`.
