# Transmission Coupling — every AI platform bolts its own transmission onto the gearbox

> **Clifton's idea.** "We could design every single one of the other AI platforms to have its own
> transmission that hooks up to my transmission." The gearbox already runs on **two** transmissions —
> the AI (autonomous) and the owner (approval) — gripping the same gears from opposite sides. This
> generalizes that: an **external platform is just another transmission** that couples into the gearbox
> through one standard port. Hearth, a Zapier bot, a supplier's agent, a future vendor AI — each grips
> the MGSF drivetrain the same way, without touching Klyfton's internals.

_Status: SPEC (design). Builds on the dual-drive in [`api/gearbox.js`](api/gearbox.js) + the arms in
[`api/act.js`](api/act.js). Plain `fetch`, no npm. Additive — nothing external can couple until Clifton
issues it a coupling token._

## 1. The coupling (the mechanical joint)
A transmission couples to the gearbox by **turning a gear** — nothing more. It POSTs an event to the
same `/api/gearbox` port every internal turn uses. The coupling is the contract at that joint:

```
POST /api/gearbox
{ action:"turn",
  event:{ name, key, payload, source },
  coupling:{ platform:"hearth", token:"<per-platform secret>" } }
```

- **`platform`** — who is gripping (the transmission's name). Namespaces the source so the Command
  Center's drivetrain strip shows *which* transmission drove the gear.
- **`token`** — the platform's coupling secret (a Script/Vercel env, `COUPLING_<PLATFORM>`). No token
  or a bad token → the coupling **slips** (rejected, logged, no gear turns). This is the safety
  interlock: an external transmission can only engage gears Clifton has bolted it to.

## 2. Coupling grades (how deep the teeth mesh)
Not every partner gets full grip. Each platform's token maps to a **grade** — which gears it may turn
and whether it can drive the owner (outward) side:

| Grade | Can turn | Owner-side (outward) | Example |
|---|---|---|---|
| **read** | nothing — GET drivetrain state only | no | a dashboard mirror |
| **signal** | `ai`-drive gears only (internal/reversible) | no | Hearth posting `call.missed` |
| **drive** | `ai`-drive gears + *draft* owner gears | drafts only (still `blocked`) | a Zapier lead router |
| **bonded** | any gear, may pass `approved:true` | yes — but only for gears Clifton bonded | a fully-trusted internal agent |

Default grade = **signal**. `bonded` is owner-granted, per-gear, and audited every turn. An external
transmission can **never** widen its own grade — grade lives with the token, set by Clifton.

## 3. The Hearth coupling (first real one)
Hearth owns missed-call recovery. Today `missed-call.js` just *defers* to Hearth (don't double-text).
With coupling, Hearth becomes a proper transmission:
- Hearth (grade **signal**) turns `call.missed { phone, at, transcript? }`.
- That AI gear updates the CRM + logs — internal, autonomous.
- If it needs an outward step (a human callback SMS), that's an **owner** gear → drafts + blocks. Hearth
  can request, only Clifton engages. Hearth still owns its own texts; the gearbox never double-sends
  (idempotent on `key`, honors the Hearth dedup rule).

## 4. Reverse coupling — the gearbox drives *their* transmission (outbound)
Coupling is a joint, so torque crosses both ways. When an MGSF gear needs an external platform to act,
it routes through the arms (`act.js`) as a **gated draft**, and on approval calls that platform's
inbound webhook (`COUPLING_<PLATFORM>_URL`). Same approval gate, same audit — the outbound half of the
coupling is just another owner gear. Inert until the URL + token envs are wired.

## 5. Safety (non-negotiable — inherits every gearbox rule)
- **Interlocked:** no valid token → no grip. Grade caps what any transmission can turn. `bonded` is
  owner-only and per-gear.
- **Owner side stays owner-only.** An external transmission at `drive` grade can *draft* an outward
  gear but it always comes back `blocked` — only Clifton (or a `bonded` grant he set) engages it.
- **Every coupled turn is logged** to the `events` table with its `platform` source — full audit of
  which transmission drove which gear.
- Plain `fetch` + built-in `crypto`. Numbers defer to doctrine; never fabricate. No Sunday. Idempotent
  on `key` so a partner re-fire is a no-op.

## 6. Build phases
- **A — Coupling port:** accept + verify `coupling{platform,token}` on `/api/gearbox`; reject on slip;
  stamp `platform` into the event source. (Additive; couplings inert until a token env exists.)
- **B — Grades:** token→grade map (env-driven); enforce grade against each gear's drive tag.
- **C — Hearth coupling:** first live transmission (`call.missed` at grade `signal`).
- **D — Reverse coupling:** outbound gated drafts to `COUPLING_<PLATFORM>_URL` on approval.
- **E — Command Center:** color the drivetrain strip by transmission (AI / owner / each platform).

## Cross-references
- [`GEARBOX_SPEC.md`](GEARBOX_SPEC.md) · [`VEHICLE_ARCHITECTURE.md`](VEHICLE_ARCHITECTURE.md) ·
  [`api/gearbox.js`](api/gearbox.js) · [`api/act.js`](api/act.js) · [`PROJECT_MEMORY.md`](PROJECT_MEMORY.md)
