// api/govcon-scanner.js — Automated GovCon Compliance Tracker (Improvement #3)
const NAICS_CODES = ["327920", "238910", "238320", "236220", "238990"];
const SAM_BASE = "https://api.sam.gov/opportunities/v2/search";

async function scanSAMGov() {
  const results = [];
  for (const naics of NAICS_CODES) {
    try {
      const r = await fetch(`${SAM_BASE}?api_key=${process.env.SAM_GOV_API_KEY}&naicsCode=${naics}&postedFrom=${getDateDaysAgo(1)}&postedTo=${getToday()}&limit=10&active=true`);
      const d = await r.json();
      if (d.opportunitiesData) results.push(...d.opportunitiesData.map(o => ({ ...o, naics })));
    } catch(e) { console.error(`SAM scan failed for NAICS ${naics}:`, e.message); }
  }
  return results;
}

async function checkCompliance(opportunity) {
  const checks = {
    cage_code: !!process.env.CAGE_CODE,
    uei_registered: !!process.env.UEI_NUMBER,
    bonding_required: opportunity.setAside !== "SBA",
    naics_match: NAICS_CODES.includes(opportunity.naicsCode),
    size_standard: true,
    cage_active: !!process.env.CAGE_CODE,
    past_performance: true
  };
  const gaps = Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k);
  const score = (Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100;
  return { checks, gaps, score: Math.round(score), canBid: gaps.length === 0 };
}

async function generateProposalOutline(opportunity) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: "claude-opus-4-5", max_tokens: 1024,
    messages: [{ role: "user", content: `Generate a brief government proposal outline for Machine Gun Spray Foam & Concrete Lifting LLC for this opportunity: ${JSON.stringify(opportunity)}. Include: Executive Summary, Technical Approach, Past Performance, Pricing Strategy.` }]
  });
  return msg.content[0].text;
}

async function runDailyScan() {
  const opportunities = await scanSAMGov();
  const ranked = [];
  for (const opp of opportunities) {
    const compliance = await checkCompliance(opp);
    ranked.push({ opportunity: opp, compliance, priority: compliance.score > 80 ? "HIGH" : compliance.score > 60 ? "MEDIUM" : "LOW" });
  }
  ranked.sort((a, b) => b.compliance.score - a.compliance.score);
  return ranked;
}

function getToday() { return new Date().toISOString().split("T")[0]; }
function getDateDaysAgo(days) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

module.exports = { runDailyScan, checkCompliance, generateProposalOutline };

module.exports.handler = async (req, res) => {
  const results = await runDailyScan();
  res.json({ scannedAt: new Date().toISOString(), opportunities: results });
};
