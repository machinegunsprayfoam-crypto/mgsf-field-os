# Supabase Setup Guide

This guide walks through connecting MGSF FieldOS to Supabase so leads, estimates, and customers are saved to the cloud database.

## 1. Create a Supabase project

1. Go to [app.supabase.com](https://app.supabase.com) and sign in or create a free account.
2. Click **New project**.
3. Name it `mgsf-field-os`, choose a region close to Montana (US West), and set a strong database password. Save the password — you will need it to connect external tools.
4. Click **Create new project** and wait for it to provision (about 60 seconds).

## 2. Apply the schema

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this repository and paste the entire contents into the editor.
4. Click **Run**. You should see "Success. No rows returned."

This creates the following tables:
- `customers` — contact records (name, phone, email, type, HubSpot/QuickBooks links)
- `properties` — job site addresses (linked to customers)
- `estimates` — bids and proposals (linked to customers and properties)
- `estimate_items` — line items for each estimate
- `field_photos` — before/during/after photo records
- `sync_events` — audit log for external system syncs

## 3. Get your API keys

1. In Supabase, click **Project Settings** → **API** in the left sidebar.
2. Copy two values:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **service_role key** — the second key under "Project API keys" (labeled `service_role`). This key bypasses Row Level Security and must stay server-side only. Never expose it in client-side code.

## 4. Add environment variables to Vercel

1. Go to your Vercel project dashboard.
2. Click **Settings** → **Environment Variables**.
3. Add the following variables (all environments: Production, Preview, Development):

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your project URL from step 3 |
| `SUPABASE_SERVICE_KEY` | Your service_role key from step 3 |

4. Click **Save** for each.
5. Redeploy your Vercel project for the variables to take effect (push any commit or click **Redeploy** in the Vercel dashboard).

## 5. Full environment variable reference

These are all the environment variables FieldOS uses. Set each in the Vercel dashboard under **Settings → Environment Variables**.

| Variable | Purpose | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Supabase database connection | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) | Supabase → Project Settings → API |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Drive & Docs API (folder and proposal creation) | Google Cloud Console → IAM → Service Accounts → Create key (JSON) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Google Drive root folder for job files | From the folder URL: `drive.google.com/drive/folders/{ID}` |
| `RESEND_API_KEY` | Email delivery for proposals and review requests | [resend.com](https://resend.com) → API Keys |
| `HUBSPOT_TOKEN` | HubSpot CRM call list and lead status | HubSpot → Settings → Integrations → Private Apps |
| `STRIPE_SECRET_KEY` | Stripe deposit checkout links | [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys |
| `ANTHROPIC_API_KEY` | AI bid parsing, takeoff, and ROI narratives | [console.anthropic.com](https://console.anthropic.com) → API Keys |

## 6. Verify it works

1. Open the FieldOS app and create a test bid.
2. Open the proposal view for that bid.
3. Click **☁ Save to Cloud**.
4. You should see "✓ Saved to cloud" in green.
5. In Supabase SQL Editor, run:
   ```sql
   select id, first_name, last_name, phone from public.customers order by created_at desc limit 5;
   ```
   You should see the test customer.

## 7. Google Drive setup (for Google Doc proposals)

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project or select an existing one.
3. Enable the **Google Drive API** and **Google Docs API** (APIs & Services → Library).
4. Go to **IAM & Admin → Service Accounts**.
5. Click **Create Service Account**. Name it `mgsf-field-os` and click Create.
6. Skip optional steps and click Done.
7. Click the service account email → **Keys** tab → **Add Key → Create new key → JSON**. Download the file.
8. In Google Drive, create a root folder called `MGSF Job Files`. Open it and copy the folder ID from the URL.
9. Share the `MGSF Job Files` folder with the service account email (Editor access).
10. In Vercel, set:
    - `GOOGLE_SERVICE_ACCOUNT_JSON` — paste the entire contents of the downloaded JSON key file
    - `GOOGLE_DRIVE_ROOT_FOLDER_ID` — the folder ID from step 8

## 8. Resend email setup

1. Go to [resend.com](https://resend.com) and sign up for a free account.
2. Add and verify your sending domain (`machinegunsprayfoam.info`) under **Domains**.
3. Go to **API Keys** → **Create API Key**. Copy it.
4. In Vercel, set `RESEND_API_KEY` to the copied value.

> **Note:** Until your domain is verified, Resend will only send to the email address you registered with.

## Row Level Security (optional)

The current setup uses the `service_role` key server-side (in Vercel API routes only), which bypasses RLS. If you want to add a customer-facing portal later, enable RLS on each table and add appropriate policies.
