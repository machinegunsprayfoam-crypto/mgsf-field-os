# Klyfton as a Vehicle — the whole system, mapped to car parts

Clifton's frame: build it like a car — you can use almost every part. This is the unifying model
for how Klyfton fits together. Two prime movers turn the machine: the **engine** (event-driven,
reactive) and the **axle** (time-driven, scheduled — "the axle that drives time"). Everything else
is how power gets from those movers to the road (real work) safely.

## The powertrain
| Car part | Klyfton | What it is |
|---|---|---|
| **Engine** | The hive — Queen router → worker minds → synthesizer/critic (Claude) | Makes the power: decisions, estimates, answers |
| **Fuel** | Data + events + API tokens | What the engine burns |
| **Fuel tank** | The brain — Supabase + brain blocks + `mgsf-core` doctrine + semantic memory | Where fuel is stored |
| **Fuel injector** | `emit()` / the gearbox dispatcher | Meters fuel (events) into the drivetrain |
| **Throttle (gas pedal)** | The ask / owner intent — how hard you engage | How much power you call for |
| **★ Axle (drives time)** | The **scheduler / heartbeat** (cron, daily brief, sweeps) | The shaft time turns — the *second* prime mover. Time rotates the axle → the axle turns the drivetrain on a cadence (daily brief, follow-up 2/7/21, roof-maintenance, cert-expiry, SAM scan) |
| **Driveshaft** | The event **spine** / bus (`events` table) | Carries power from the engine down the drivetrain |
| **Transmission** | The **gearbox** — engage any combination of gears | Selects which gears take the drive (any/all combos) |
| **Clutch** | The **arms' approval gate** (`act.js`) | Engages power to *outward* action only when you press it (your approval) — lets the engine run without the wheels moving |
| **Differential** | The Queen **router** | Splits the drive to many gears at different rates (fan-out / gear ratio) |
| **Wheels / tires** | Outward actions — jobs booked, emails/texts sent, invoices | Where the rubber meets the road (real work on the ground) |

## The controls, safety & instruments
| Car part | Klyfton |
|---|---|
| **Ignition / key** | Auth — crew code / API key (turns it on) |
| **Battery** | Persistent memory — `PROJECT_MEMORY.md` + pgvector memory (holds charge across sessions, starts the engine) |
| **Alternator** | Feedback loops that recharge — realized margin → Estimator; reviews → Marketing; run cost → budget |
| **ECU (engine computer)** | `mgsf-core` doctrine + the critic — governs limits, kills fabrication |
| **Brakes** | Hard gates / kill switches — no Sunday, no auto-send, monthly budget cap |
| **Seatbelts / airbags** | Guardrails — never fabricate, never guarantee savings, never claim mold elimination |
| **Suspension** | Self-healing / error handling — `runMindResilient`, retries, graceful degradation |
| **Steering** | Clifton's direction — owner intent sets the heading |
| **Dashboard / gauges** | The **Operations Command Center** — KPI tiles, top-agents, the live drivetrain strip, the odometer |
| **Odometer (with reverse gear)** | **Miles = reciprocity.** +1 FORWARD when Clifton drives an owner gear (leverage); −1 REVERSE when an owner gear blocks (the machine reaches into him for approval — his attention). Net = is the machine a net force-multiplier. `events.miles` + `v_odometer`. |
| **Fuel gauge** | **Tokens / $** — `agent_runs.cost_usd`. A SEPARATE gauge from the odometer: miles can net to zero while fuel still burned. The odometer nets out; the fuel gauge never lies. |

## The two prime movers (the key idea)
- **Engine = reactive.** A real-world event (estimate closed, job completed) fires → the driveshaft
  carries it → the transmission turns the engaged gears. Power on demand.
- **Axle = time.** The scheduler turns on a cadence — nobody has to ask. Time is the axle: it drives
  the daily brief, the follow-up sweeps, the cert-expiry watch, the SAM scan. Same drivetrain, but
  the *clock* is turning it instead of an event.
Both feed the same gearbox; a gear-turn is either **engine-driven** (an event) or **axle-driven**
(a scheduled tick). The Command Center's drivetrain strip shows both.

## What this tells us to build next
- ✅ **The axle is BUILT** (`api/axle.js`, 2026-07-25) — a time-driven `turn()` that engages a saved
  **transmission program** (`PROGRAMS.daily` / `PROGRAMS.weekly`) through the gearbox on a cadence.
  Sunday-guarded; idempotent per day; dual-drive honored (AI gears run, owner gears draft+block).
  Two Vercel crons added (`?cadence=daily` 11:30, `?cadence=weekly` Mon 11:35, both `1-6`). It does
  **not** replace the 7 dedicated outward crons — it's the coordination/heartbeat layer that couples
  TIME to the drivetrain so the clock's turns show on the Command Center strip (source `axle:*`).
- The **clutch** (approval gate) already exists in `act.js`; the dual-drive makes it the owner
  transmission. Saved engagement **presets** (Money/Workers/All) still to graduate from the 3D model
  into named gearbox programs the axle can run.
- The **dashboard** is live (Phase C). The **wheels** turn for real once triggers call `turn()`.
- Still missing crew: a **Mechanic** (health/repair agent) and an **Engineer** (build/improve agent) —
  the car has suspension (`runMindResilient`) + an ECU/critic, but nobody in the pit. Deferred by
  Clifton 2026-07-25 in favor of the axle.

## Refinements (Clifton, 2026-07-25)
- **Engine powers the Queen** — the Queen is *driven*, not the prime mover. The engine (hive) sends
  power down the driveline to spin her; she distributes it (differential/router).
- **Two linked transmissions, opposite sides — the dual-drive.** The **Klyfton (AI)** transmission
  and the **Clifton (owner)** transmission grip the *same* gears from opposite sides. A gear can be
  driven by the AI (autonomous, reversible/zero-$) or by the owner (approval). **Gated gears
  (Invoice, Review, Arms) can ONLY be driven from the owner side** — that *is* the approval gate,
  expressed as a transmission. In code: two engagement sources per gear — an autonomous binding and
  an approval-required binding.
- **RPM is real — RPM sets speed.** A tachometer/throttle: `speed ≈ rpm × engaged gears`. Throttle
  (idle/cruise/redline) sets how fast the drivetrain runs = system throughput. Ties to the budget
  (fuel) and the axle (time cadence).

## Cross-references
- [`GEARBOX_SPEC.md`](GEARBOX_SPEC.md) · [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md) ·
  [`api/gearbox.js`](api/gearbox.js) · [`api/act.js`](api/act.js) · [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) ·
  3D model: https://claude.ai/code/artifact/d691e871-9e49-4c03-b2cf-af208672ca7d
