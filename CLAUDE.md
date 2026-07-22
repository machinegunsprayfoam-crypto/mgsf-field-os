# Klyfton AI × Silvr Integration

Klyfton AI is a multi-agent command system built on Claude AI. This document describes how Silvr (another Claude-powered agent system) integrates as a secondary intelligence layer.

## ⚡ Session-Start Protocol (do this FIRST, every session)

**Google Drive changes constantly — audit it before doing any work.** At the start of every
session, before building or advising:

1. **Check the skills area** — `02_Skills_and_Packs` folder (and `claude-code-skills` / `skills`)
   for new or updated `mgsf-*.skill` packages. `mgsf-core.skill` is the authoritative doctrine
   (locked pricing, cost constants, GM targets, state multipliers, gates) — **it wins over any
   conflicting number in code.**
2. **Check recent Drive files** (`list_recent_files`) for new expert docs, pricing CSVs, or
   decision logs since last session.
3. **Reconcile** anything new/changed into Klyfton's brain (`api/klyfton.js` DOCTRINE /
   EXPERT_LIBRARY blocks) before working. Flag pricing conflicts to Clifton — never silently
   pick a rate. Newest-dated locked rate wins.
4. **GovCon check (Tango, not GovTribe — GovTribe is cancelled):** run a quick Tango
   `search_opportunities` for MGSF's lane (NAICS 238310/238160/238190) in MT/ND/SD/WY + VA
   SDVOSB set-asides. Flag only real, in-region, in-trade opportunities. (The app's SAM.gov
   daily scanner already covers the regional baseline automatically.) A scheduled cron can't
   carry the Tango/Drive connectors, so this check has to happen in an interactive session.

Skip only if the user explicitly says to skip the Drive check.

## Architecture

### Existing Stack (Pre-Silvr)
- **Frontend**: public/index.html (11,207 lines, single-file app)
- **Backend**: api/klyfton.js (Queen router + worker + critic pattern)
- **Database**: Supabase (db/ folder contains schema + structured brain)
- **Hosting**: Vercel (auto-deploys from GitHub)
- **CRM**: HubSpot integration for lead/job data
- **Intelligence**: Claude AI via Anthropic API (already in api/klyfton.js)

### New Integration (Silvr Layer)
- **New Module**: api/silvr.js (SilvrWorker class)
- **Bridge**: Silvr executes tasks on behalf of Klyfton agents
- **Capabilities**: Email, scheduling, web search, image generation, file operations, memory, system commands
- **Deployment**: Committed to GitHub, auto-deploys via Vercel CI/CD

## How It Works

### 1. Klyfton Agent calls Silvr
`javascript
const SilvrWorker = require('./silvr');
const silvr = new SilvrWorker(process.env.SILVR_API_KEY);

// Example: Lead Intake Agent sends welcome email via Silvr
await silvr.sendEmail(
  'lead@company.com',
  'Welcome to Machine Gun Spray Foam',
  'We received your inquiry and will follow up shortly.'
);
`

### 2. Silvr Executes the Task
Silvr receives the task request and uses its native tools:
- **email_send** / **email_draft** — Send or draft emails from user's Gmail/Outlook
- **web_search** — Real-time information lookup
- **generate_image** — Create before/after mockups, ad creative
- **create_schedule** — Recurring tasks (daily briefs, weekly reports)
- **browser_action** — Automate web dashboards (Meta Ads, Shopify, HubSpot, etc.)
- **run_command** — Execute scripts, manage files, deploy code
- **add_memory** — Save facts for long-term recall
- **search_memory** — Retrieve saved context

### 3. Result Returns to Klyfton
Silvr returns success/failure + metadata back to the calling agent.

## 10 Klyfton Agents (Now Silvr-Enabled)

### 1. Lead Intake Specialist
- Parses form submissions
- Validates location & phone
- Scores qualification (0-100)
- **Silvr Task**: Sync to HubSpot, send auto-followup email, schedule 2-hour callback

### 2. Estimator Pro
- Analyzes job specs
- Calculates foam/concrete costs
- Generates pricing
- **Silvr Task**: Create before/after mockups, email PDF proposal, track open rates

### 3. Job Scheduler
- Creates calendar entries
- Assigns crew by availability
- Optimises timeline
- **Silvr Task**: Send customer confirmations, notify field team, handle weather delays

### 4. Billing Master
- Calculates final costs
- Generates invoices
- Syncs to QuickBooks
- **Silvr Task**: Email invoices, send payment reminders, generate P&L reports

### 5. Zapier Orchestration Master
- Builds multi-app workflows
- Manages triggers & conditions
- Tests & monitors
- **Silvr Task**: Update workflow diagrams, log automation errors, send status alerts

### 6. Code Manager
- Monitors GitHub repos
- Tracks deployments
- Reviews PRs
- **Silvr Task**: Check app uptime, trigger Vercel redeploys, patch security vulnerabilities

### 7. GovCon Specialist
- Scans SAM.gov daily
- Identifies relevant bids
- Generates compliance checklists
- **Silvr Task**: Research bid requirements, draft proposals, track deadlines

### 8. Marketing Strategist
- Creates content calendar
- Generates before/after images
- Writes ad copy
- **Silvr Task**: Generate hero images (Gemini), create social posts, audit SEO

### 9. Email Automation Agent
- Manages customer outreach sequences
- Tracks delivery & engagement
- Handles compliance
- **Silvr Task**: Draft/send welcome emails, estimate follow-ups, review reminders, field team alerts

### 10. Executive Dashboard
- Real-time P&L tracking
- KPI monitoring
- Pipeline visibility
- **Silvr Task**: Pull daily revenue from accounting, generate margin alerts, send briefings

## Environment Variables Required

Add these to your **Vercel Project Settings** → **Environment Variables**:

`
SILVR_API_KEY=<your-silvr-auth-token>
SILVR_ENDPOINT=https://silvr.internal:3000
ANTHROPIC_API_KEY=<your-existing-claude-key>
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-supabase-key>
HUBSPOT_API_KEY=<your-hubspot-key>
`

## Integration Points in Code

### In api/klyfton.js (Queen Router)
`javascript
const SilvrWorker = require('./silvr');
const silvr = new SilvrWorker(process.env.SILVR_API_KEY);

// When a worker needs to execute an external task:
const result = await silvr.execute({
  action: 'send_email',
  params: { to, subject, body }
});
`

### In public/index.html (Frontend)
No changes needed — the frontend doesn't directly call Silvr. All communication flows through the backend.

## Deployment Steps

1. **Commit to GitHub**:
   `ash
   git add api/silvr.js CLAUDE.md
   git commit -m "feat: Add Silvr integration layer"
   git push origin main
   `

2. **Vercel Auto-Deploy**:
   - GitHub webhook triggers Vercel build
   - New /api/silvr endpoint becomes available
   - Deployment completes in ~60 seconds

3. **Set Environment Variables**:
   - Go to Vercel Dashboard → mgsf-field-os Project
   - Settings → Environment Variables
   - Add SILVR_API_KEY and SILVR_ENDPOINT

4. **Test the Integration**:
   - Use Klyfton AI dashboard → INTEL module
   - Trigger a test task (e.g. "Send welcome email to test@example.com")
   - Check logs in Vercel → Functions

## Monitoring & Logs

- **Vercel Logs**: Dashboard → Logs → Filter by /api/silvr
- **Klyfton AI**: INTEL module shows all Silvr task execution history
- **GitHub Actions**: .github/workflows/deploy.yml tracks CI/CD pipeline

## Future Enhancements

- [ ] Direct Klyfton AI → Silvr memory sharing (context pooling)
- [ ] Silvr-triggered alerts back to Klyfton dashboard
- [ ] Real-time field team notifications via Silvr SMS
- [ ] Automated SEO audits + GBP updates
- [ ] AI-powered crew scheduling optimization
