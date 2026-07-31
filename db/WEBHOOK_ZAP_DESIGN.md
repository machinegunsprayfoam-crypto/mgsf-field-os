# Klyfton alerts webhook — the Zapier "catch & route" Zap (ALERTS_WEBHOOK_URL)

Klyfton's arms (`api/act.js`) POST **already-approved** outward actions to `ALERTS_WEBHOOK_URL`.
This doc is the owner-side Zap that receives them and routes each to a real send. Klyfton only
dispatches after the owner approves, so the Zap just executes — it never decides.

## The exact payload Klyfton sends
```json
{ "event": "arm_send_email",
  "action": { "type": "send_email", "to": "lead@x.com", "subject": "Your quote", "body": "..." },
  "actor": "clifton", "at": "2026-...", "token": "<WEBHOOK_SECRET if set>" }
```
Headers also include `x-klyfton-event` and (if set) `x-klyfton-token`.

⚠️ **Zapier flattens nested JSON with double-underscores** — map `action__to`, `action__subject`,
`action__body`, `event`, `token` (not `action.to`).

## Build it
1. **Trigger — Webhooks by Zapier → Catch Hook.** The URL it returns IS `ALERTS_WEBHOOK_URL`
   (paste into Vercel).
2. **Filter by Zapier** (do this — the URL is public): *Only continue if* `token` **exactly matches**
   a secret you choose. Set that same secret in Vercel as `WEBHOOK_SECRET` (or `ALERTS_WEBHOOK_SECRET`).
   Now only Klyfton can trigger sends.
3. **Paths** — branch on `event`:

| `event` | Action step | Field mapping |
|---|---|---|
| `arm_send_email` | Gmail → Send Email | To `action__to` · Subject `action__subject` · Body `action__body` |
| `arm_send_sms` | Twilio → Send SMS | To `action__to` · Message `action__body` |
| `arm_crm_update` | HubSpot → Create/Update Contact | from `action__fields…` |
| `arm_create_invoice` | QuickBooks → Create Invoice (draft) | Customer `action__customer` · Amount `action__amount` · Memo `action__job` |
| `arm_book_appointment` | Google Calendar → Create Event | Title `action__service` · Who `action__customer` · When `action__when` |
| `arm_place_material_order` | Gmail → Email supplier | Body `action__items` + `action__job` |
| `arm_zap` (universal bus) | Gmail → Email yourself `action__app`/`action__op`/`action__params` (v1: handle manually) | — |

## Roll out in two phases
- **Phase 1 (5 min, safe):** Trigger → Filter (token) → ONE Gmail "email yourself" action dumping
  `event` + `action__*`. Every approved action now lands in your inbox — live + safe + verifiable.
- **Phase 2:** replace that with the Paths table above, one path at a time (email → SMS → CRM → invoice).

## Vercel env to set alongside
- `ALERTS_WEBHOOK_URL` = the Catch Hook URL
- `WEBHOOK_SECRET` = the secret from step 2 (matches the filter)

## Notes
- Arms are approval-gated in `act.js`; the webhook only ever receives `approved:true` actions.
- Idempotency (`api/idempotency.js`) prevents the same action firing twice on a retry.
- Cross-reference: `db/SETUP.md` (Supabase), `api/act.js` (the arms), `api/tools.js` `zapier-bus` (the universal bus).
