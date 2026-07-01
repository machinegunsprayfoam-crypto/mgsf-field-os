# MGSF FieldOS

Private business operating system for **Machine Gun Spray Foam & Concrete Lifting LLC**.

Owner: Clifton Behner  
Website: https://www.machinegunsprayfoam.info  
Service region: Montana, Wyoming, North Dakota, South Dakota

## Mission

Build one source of truth for estimating, lead qualification, project tracking, proposal creation, job photos, customer records, government contracting prep, and business automation.

## Core services

- Spray foam insulation
- Commercial SPF roofing systems
- Roof coatings
- Concrete lifting and leveling
- Void filling
- Soil stabilization
- Polyurea coatings
- Building performance services

## Operating modules

| Module | Purpose |
|---|---|
| Lead Intake | Capture customer info, project type, urgency, budget, photos, location, and next step |
| Estimating | Calculate materials, labor, consumables, margin, travel, equipment, and proposal pricing |
| Proposals | Generate professional customer-facing bid packages |
| Projects | Track active jobs, photos, notes, invoices, change orders, and closeout documents |
| Marketing | Feed website, Google Business Profile, social media, and ad content |
| Government Contracting | Store SAM/UEI readiness docs, capability statement, NAICS/PSC codes, and opportunity notes |
| Automations | Connect forms, Google Drive, Sheets, CRM, email, reminders, and reporting |

## Repo structure

```text
/docs/                 Business process documents and SOPs
/data/                 Schemas, templates, and non-sensitive operating data
/estimating/           Pricing logic, calculators, assumptions, and quote templates
/forms/                Lead intake and project intake templates
/proposals/            Proposal templates and reusable customer language
/projects/             Project tracking templates and folder conventions
/government-contracts/ SAM, NAICS, PSC, capability statement, and bid-readiness docs
/automations/          Zapier, Google Drive, Apps Script, webhook, and workflow notes
/.github/              Issue templates and GitHub task management
```

## Rules

1. Do not commit passwords, API keys, EIN, bank info, customer private data, medical data, or private documents.
2. Put private business identifiers in Google Drive or a secure vault, not public code.
3. Every automation should have a plain-English SOP before code is added.
4. Every estimating formula must show assumptions.
5. Every customer-facing proposal must be reviewed before sending.

## First build priorities

- Lead intake form schema
- Estimator data model
- Google Drive folder mapping
- Proposal template
- Customer/project photo workflow
- Government contracting readiness checklist
- Marketing content calendar
