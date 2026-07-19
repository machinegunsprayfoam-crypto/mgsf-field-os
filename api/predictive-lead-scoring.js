// api/predictive-lead-scoring.js
// Autonomous lead scoring with Claude AI + historical learning

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

// Historical lead conversion data (seeded — builds over time)
const historicalLeads = [
  { location: "Montana", jobType: "spray-foam", value: 45000, converted: true, daysToClose: 7 },
  { location: "Wyoming", jobType: "concrete-lifting", value: 28000, converted: true, daysToClose: 14 },
  { location: "Idaho", jobType: "spray-foam", value: 12000, converted: false, daysToClose: 0 },
  { location: "Colorado", jobType: "spray-foam", value: 65000, converted: true, daysToClose: 5 },
  { location: "Utah", jobType: "concrete-lifting", value: 18000, converted: true, daysToClose: 21 },
];

async function scoreLeadPredictively(lead) {
  const context = 
You are a predictive lead scoring AI for Machine Gun Spray Foam & Concrete Lifting.

Historical conversion data:


New lead to score:
- Location: 
- Job Type: 
- Estimated Value: {lead.value}
- Company Size: 
- Previous Customer: 
- Contact Quality: 

Analyze this lead based on historical patterns. Score 0-100.
Also predict:
1. Likelihood to convert (%)
2. Days to close (if converts)
3. Optimal follow-up timing
4. Risk factors

Return JSON: { score, convertChance, estimatedDaysToClose, followUpTiming, risks }
;

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: context,
      },
    ],
  });

  try {
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 50, error: "Parse failed" };
  } catch (e) {
    return { score: 50, error: e.message };
  }
}

async function routeLeadAutonomously(lead, score) {
  // Auto-route based on score
  if (score.score >= 80) {
    return { action: "PRIORITY", channel: "phone-call", delay: "immediate" };
  } else if (score.score >= 60) {
    return { action: "FOLLOW-UP", channel: "email", delay: "2-hours" };
  } else if (score.score >= 40) {
    return { action: "NURTURE", channel: "sms", delay: "24-hours" };
  } else {
    return { action: "MONITOR", channel: "email-list", delay: "weekly" };
  }
}

module.exports = { scoreLeadPredictively, routeLeadAutonomously };
