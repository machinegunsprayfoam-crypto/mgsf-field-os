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
| **Dashboard / gauges** | The **Operations Command Center** — KPI tiles, top-agents, the live drivetrain strip |
| **Odometer** | `agent_runs` telemetry — every mile (run) logged |

## The two prime movers (the key idea)
- **Engine = reactive.** A real-world event (estimate closed, job completed) fires → the driveshaft
  carries it → the transmission turns the engaged gears. Power on demand.
- **Axle = time.** The scheduler turns on a cadence — nobody has to ask. Time is the axle: it drives
  the daily brief, the follow-up sweeps, the cert-expiry watch, the SAM scan. Same drivetrain, but
  the *clock* is turning it instead of an event.
Both feed the same gearbox; a gear-turn is either **engine-driven** (an event) or **axle-driven**
(a scheduled tick). The Command Center's drivetrain strip shows both.

## What this tells us to build next
- The **axle** is the scheduler layer: a time-driven `turn()` (daily/weekly ticks) that engages a
  saved transmission program (e.g. the "Money chain" or "Field crew" preset) on a cadence.
- The **clutch** (approval gate) already exists in `act.js`; the **transmission programs** (saved
  engagement sets) are the next gearbox feature.
- The **dashboard** is live (Phase C). The **wheels** turn for real once triggers call `turn()`.

## Cross-references
- [`GEARBOX_SPEC.md`](GEARBOX_SPEC.md) · [`OPERATIONS_COMMAND_CENTER.md`](OPERATIONS_COMMAND_CENTER.md) ·
  [`api/gearbox.js`](api/gearbox.js) · [`api/act.js`](api/act.js) · [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md) ·
  3D model: https://claude.ai/code/artifact/d691e871-9e49-4c03-b2cf-af208672ca7d
