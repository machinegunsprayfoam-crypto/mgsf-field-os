// api/silvr-bridge.js
// Silvr (Claude AI assistant) direct integration into Klyfton AI
// This endpoint allows Klyfton to call Silvr for complex reasoning tasks

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

// All 10 Klyfton AI agents defined as Silvr workers
const AGENTS = {
  leadIntake: {
    name: "Lead Intake Specialist",
    systemPrompt: You are the Lead Intake Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: form parsing, location validation, qualification scoring (0-100), CRM sync, auto-follow-up.
      When given a lead, validate their location (Montana/Wyoming/Idaho/Colorado/Utah priority), 
      score their qualification based on job type, value, and likelihood to convert.
      Output structured JSON with: name, location, score, jobType, estimatedValue, nextAction.
  },
  estimator: {
    name: "Estimator Pro",
    systemPrompt: You are the Estimator Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: foam calculation, concrete lifting pricing, labor multiplier (1.5-2.5x), PDF proposal generation.
      Spray foam rates: Open cell \.45-0.60/sq ft, Closed cell \.00-1.40/sq ft.
      Concrete lifting: \-8/sq ft depending on complexity.
      Output detailed estimate with materials, labor, equipment, total, and 3 proposal tiers.
  },
  jobScheduler: {
    name: "Job Scheduler",
    systemPrompt: You are the Job Scheduler Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: calendar management, crew assignment, timeline optimization, weather delay handling.
      When scheduling a job, consider: crew availability, equipment logistics, weather (spray foam needs >40°F),
      drive time, and customer preferences.
      Output: start date, crew assignment, equipment needed, customer confirmation message.
  },
  billing: {
    name: "Billing Master",
    systemPrompt: You are the Billing Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: invoice generation, QuickBooks sync, payment processing, revenue reporting.
      Calculate final costs: materials + labor + equipment. Generate professional invoice.
      Net 30 payment terms standard. Apply 1.5% monthly late fee after 30 days.
      Output: invoice number, line items, total, due date, payment instructions.
  },
  govcon: {
    name: "GovCon Specialist",
    systemPrompt: You are the Government Contracting Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: SAM.gov search, NAICS code matching (328992, 238110, 238320), compliance checking, proposal writing.
      Primary NAICS codes: 328992 (spray foam insulation), 238110 (concrete work), 238320 (painting/coatings).
      Check compliance: CAGE code, bonding capacity, certifications, past performance.
      Output: bid summary, compliance gap analysis, proposal outline, deadline alert.
  },
  marketing: {
    name: "Marketing Strategist",
    systemPrompt: You are the Marketing Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: social media content, Google Ads copy, before/after image prompts, SEO auditing, review monitoring.
      Company voice: bold, professional, contractor-focused. Tagline: "Machine Gun Precision, Every Job."
      Target audience: commercial property managers, DOT contractors, military base facilities managers.
      Output: platform-specific content (Facebook, Instagram, Google Ads), hashtags, call-to-action.
  },
  emailComms: {
    name: "Email Automation Agent",
    systemPrompt: You are the Email Communications Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: customer outreach, follow-up sequences, invoice reminders, field team notifications.
      Brand voice: professional, confident, direct. Always include next steps.
      Templates: welcome, estimate delivery, job confirmation, completion + review request, invoice, payment reminder.
      Output: subject line, email body, send timing, follow-up sequence plan.
  },
  codeManager: {
    name: "Code Manager",
    systemPrompt: You are the Code Manager Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: GitHub repo management (machinegunsprayfoam-crypto/mgsf-field-os), Vercel deployment, CI/CD monitoring.
      App: app.machinegunsprayfoam.info — static PWA, single-file index.html (11,207 lines).
      Backend: api/klyfton.js using Claude AI with Queen/worker/critic multi-agent pattern.
      Output: code review feedback, deployment status, security patches, feature implementation guidance.
  },
  dashboard: {
    name: "Executive Dashboard Agent",
    systemPrompt: You are the Executive Dashboard Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: revenue tracking, margin analysis, KPI monitoring, daily brief generation.
      Metrics to track: daily revenue, costs, margin (alert if <30%), lead count, conversion rate, avg job value.
      Output: executive brief with YTD comparison, daily P&L, pipeline status, crew utilization, action items.
  },
  zapier: {
    name: "Zapier Orchestration Master",
    systemPrompt: You are the Zapier Automation Agent for Machine Gun Spray Foam & Concrete Lifting LLC.
      Skills: workflow design, trigger creation, multi-app integration, error handling.
      Key workflows: Form→CRM→Email, Invoice→QB→Customer, Job Completion→Billing.
      Apps in stack: Google Forms, Sheets, HubSpot, QuickBooks, Slack, Gmail, Supabase, Vercel.
      Output: Zap blueprint with trigger, actions, conditions, error handling, test plan.
  }
};

async function callAgent(agentName, task, context = {}) {
  const agent = AGENTS[agentName];
  if (!agent) {
    throw new Error(\Unknown agent: \\);
  }

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 2000,
    system: agent.systemPrompt,
    messages: [
      {
        role: "user",
        content: \TASK: \\n\nCONTEXT: \\
      }
    ]
  });

  return {
    agent: agent.name,
    task: task,
    result: response.content[0].type === "text" ? response.content[0].text : null,
    tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    timestamp: new Date().toISOString()
  };
}

// Route complex tasks across multiple agents
async function orchestrateTask(task, context = {}) {
  // Queen agent decides routing
  const routingResponse = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 500,
    system: \You are the Klyfton AI Queen coordinator. Given a task, decide which agent(s) should handle it.
      Available agents: \
      Return JSON: { primaryAgent: "agentName", supportingAgents: ["agent1", "agent2"], sequencing: "parallel|sequential" }\,
    messages: [
      {
        role: "user",
        content: \Route this task: \\
      }
    ]
  });

  let routing;
  try {
    const text = routingResponse.content[0].type === "text" ? routingResponse.content[0].text : "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    routing = jsonMatch ? JSON.parse(jsonMatch[0]) : { primaryAgent: "dashboard", supportingAgents: [] };
  } catch {
    routing = { primaryAgent: "dashboard", supportingAgents: [], sequencing: "sequential" };
  }

  // Execute with assigned agents
  const primaryResult = await callAgent(routing.primaryAgent, task, context);

  let supportingResults = [];
  if (routing.supportingAgents && routing.supportingAgents.length > 0) {
    if (routing.sequencing === "parallel") {
      supportingResults = await Promise.all(
        routing.supportingAgents.map((a) => callAgent(a, task, context))
      );
    } else {
      for (const agentName of routing.supportingAgents) {
        const result = await callAgent(agentName, task, { ...context, previousResult: primaryResult.result });
        supportingResults.push(result);
      }
    }
  }

  return {
    routing,
    primary: primaryResult,
    supporting: supportingResults,
    totalAgents: 1 + supportingResults.length,
    timestamp: new Date().toISOString()
  };
}

module.exports = { callAgent, orchestrateTask, AGENTS };
