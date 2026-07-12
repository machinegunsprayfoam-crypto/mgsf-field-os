# MGOS Master Architecture

MGOS is the business operating system for Machine Gun Spray Foam & Concrete Lifting LLC.

## Product goal

Create one command system for lead capture, estimating, proposals, job tracking, photos, government contracting, marketing, reporting, and automation.

## Recommended stack

- Frontend: Next.js
- Backend: Supabase
- Database: PostgreSQL
- Auth: Supabase Auth
- File storage: Google Drive for official documents, Supabase Storage for app uploads if needed
- Hosting: Vercel
- Automations: Zapier + Google Apps Script
- Maps: Google Maps
- Version control: GitHub

## Major modules

1. Dashboard
2. CRM
3. Lead intake
4. Estimating
5. Proposal generator
6. Scheduling
7. Project management
8. Photo management
9. Inventory and consumables
10. Equipment and maintenance
11. Fleet
12. Safety and OSHA
13. Government contracting
14. Marketing hub
15. AI Command Center
16. Reporting and KPIs
17. Google Drive sync
18. Admin settings

## AI Command Center (Klyfton Hive)

Single front door: one Klyfton chat routes work to specialist agents and returns one reviewed answer.

Initial production specialists:
- Lead Qualifier / CRM Follow-up
- Estimator
- Proposal Drafter
- Scheduler / Ops
- Safety / JSA
- Materials / Inventory / Ordering
- Reporting / KPI
- Opportunity Hunter (local + GovCon)

Guardrails:
- Agents draft; humans confirm every write/send action.
- Role-aware action limits (readonly, field, admin/full).
- Real records only (leads/jobs/inventory/pricing from app context).

## User roles

- Owner/Admin: full access
- Estimator: leads, estimates, proposals, projects
- Crew Lead: assigned jobs, photos, notes, material usage, checklists
- Office/Admin Assistant: leads, scheduling, documents, customer communication
- Read Only: reports and job records only
- Customer Portal User: limited access to their own proposal, contract, photos, and job status

## Core workflow

1. Lead enters system from phone, website, Google Business Profile, referral, or manual entry.
2. MGOS qualifies the lead and requests missing information.
3. Estimator creates job estimate from measured quantities and assumptions.
4. Proposal is generated and stored.
5. Customer approves proposal.
6. Job folder is created in Google Drive.
7. Project is scheduled.
8. Crew captures before, during, and after photos.
9. Materials, labor, and notes are logged.
10. Invoice and closeout package are completed.
11. Review request and follow-up marketing happen automatically.

## Security rules

- Never commit customer private data, passwords, API keys, EIN, banking info, or medical/private records.
- Use environment variables for secrets.
- Use least-privilege access roles.
- Public marketing content belongs in public repos only if it contains no private information.
- Official customer files belong in Google Drive business folders, not GitHub.

## MVP definition

MGOS Alpha is complete when the system can:

- Capture a lead
- Store customer and project information
- Calculate a basic spray foam estimate
- Generate a proposal draft
- Create or map a Google Drive job folder
- Track a project status
- Store photo categories
- Show dashboard counts
