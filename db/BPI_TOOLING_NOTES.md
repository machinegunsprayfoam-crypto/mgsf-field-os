# BPI / home-energy-audit tooling — landscape, standards, and MGSF's build-vs-buy stance

Research notes (Aug 2026) behind `api/energy-audit.js` + `db/BPI_REPORT_TEMPLATE.md`. Prompted by
Clifton reviewing OptiMiser Zeus and Snugg Pro (screenshots of a "Sample Job" audit: 1936 SFD,
2,500 ft², 40×32, 8-ft walls, 4 BR / 2 occ; concerns = cold kitchen floor, drafty / no wall
insulation, CO alarm tripping, gas bills too high).

## The two reference tools
- **OptiMiser Zeus** — full residential platform: automated **utility-bill calibration** of an energy
  model, design-load calc, ASHRAE 62.2, combustion-safety (CAZ) wizard, AI appliance-ID from photos,
  customizable sales reports, Salesforce/CRM integration, RESNET-certified, weatherization-qualified.
  ("100% accurate models" is vendor marketing, not a verified claim.)
- **Snugg Pro** (Franklin Energy) — **BPI-2400-compliant** modeled whole-home assessments; supports
  **HPXML 2.1, DOE Home Energy Score, Green Button, BPI-2100/2101/2200/2400**; Health & Safety
  (combustion) section; default + custom **recommendation library** with reusable boilerplate; polished
  homeowner reports. Required for the **IRA HOMES rebate program**.

## Standards that matter (for interop / compliance)
- **ANSI/BPI-2400** — the bill-*calibrated* energy model (modeled savings you can defend). This is the
  bar for rebate/utility programs. Our `energy-audit.js` is lighter: summer-minimum **disaggregation**,
  a **sales-grade ESTIMATE**, NOT a calibrated BPI-2400 model. Say so; never imply certification.
- **HPXML 2.1** — the data-interchange format if MGSF ever exports to these tools / programs.
- **DOE Home Energy Score**, **Green Button** (utility data import), **ASHRAE 62.2** (ventilation —
  already in `api/bpi-calc.js`).

## MGSF build-vs-buy (decision)
Don't rebuild a certified BPI-2400/HPXML/HES engine — that's RESNET-grade, multi-year work, and not
MGSF's business. Split it:
- **Klyfton (build, own it):** the fast **sales-grade** audit + branded report on every job —
  utility baseline, heating-load slice, ESTIMATE savings from foam, homeowner concerns → measures.
  Free, instant, no subscription. Always labeled ESTIMATE.
- **Snugg Pro / OptiMiser (buy when needed):** any **certified/modeled** report for IRA HOMES rebates
  or utility programs. Rebates = customer's money = easier close; worth the subscription per-program.

## What a full report needs
- **Building-geometry intake** — ✅ BUILT (`energy-audit.js` `geometry()`): conditioned area, wall
  height, dims, floors, bedrooms, occupants, year built → volume (feeds `bpi-calc` ACH50) + rough
  envelope area (ESTIMATE); missing inputs omitted, never guessed.
- **Homeowner-concerns intake → measures** — ✅ BUILT (`concernsToMeasures()`): cold floor → floor/
  cantilever foam; drafty/no wall insulation → air-seal + wall foam; high gas → envelope + baseline;
  **CO/combustion → CAZ safety flag (not an upsell)**; moisture → manage vapor (no mold claim);
  unmatched → "assessment needed". Surfaces a top-level `safetyFlag` when a combustion concern exists.
- **BPI panel in the app UI** — not yet built (owner's call; endpoint + brain tool-bag entry exist).
- **Recommendation library** (reusable measure write-ups) — natural fit for the existing `wiki`.

## HARD SAFETY RULE (non-negotiable in any MGSF energy report)
Air-sealing a home with **atmospheric combustion appliances** can worsen **backdrafting / CO**. BPI
requires **combustion-safety (CAZ) testing** before and after tightening. Any report on a house with a
CO concern (like the sample) MUST flag CAZ testing and defer to the safety protocol — never just seal
it. See `mgsf-safety-osha` + `mgsf-building-science`. And per doctrine: never claim mold elimination,
never guarantee savings.

## Cross-reference
`api/energy-audit.js` · `api/bpi-calc.js` · `db/BPI_REPORT_TEMPLATE.md` · skills: `mgsf-blower-door`,
`mgsf-building-science`, `mgsf-safety-osha`, `mgsf-codes-permits`, `mgsf-core`.
