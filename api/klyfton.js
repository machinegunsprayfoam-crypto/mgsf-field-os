// Ask Klyfton AI — Claude-backed field assistant for Machine Gun Spray Foam.
// Runs as a Vercel serverless function. No npm deps (uses global fetch).
// Requires env var ANTHROPIC_API_KEY (set in Vercel → Settings → Environment Variables).
// Optional env var CREW_CODE: if set, the client must send a matching { code }.

const MODEL = "claude-opus-4-8"; // swap to "claude-sonnet-5" or "claude-haiku-4-5" to cut cost
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM = `You are Klyfton, the AI assistant inside the Klyfton AI field app for
Machine Gun Spray Foam & Concrete Lifting, LLC (owner: Clifton Behner, a USMC combat veteran).
You help the crew and owner in the field: spray foam (open/closed cell), SPF roofing, coatings,
concrete lifting/leveling, void fill, estimating, materials, spray conditions, and job questions.

How to answer (match the owner's style):
- Blunt, numbers-first, decision-ready. Lead with a TL;DR or the number that matters.
- Give 2-3 options with cost/time/risk when relevant, then name the pick and why.
- Keep it to one screen when possible. Use checklists and clear steps.
- Never fabricate prices, specs, addresses, or figures. If you don't know, say so or look it up.
- When a question depends on current info (product specs, prices, weather, code) use web search.
- Professional, veteran-owned, direct, confident, practical, blue-collar voice.
- Never schedule work or reminders on Sundays.`;

function textFrom(content) {
  return (content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Gated: not configured yet. Never fabricate — tell the user how to turn it on.
    res.status(200).json({
      text:
        "⚙️ Ask Klyfton AI isn't switched on yet. Owner: in Vercel → the mgsf-fieldos " +
        "project → Settings → Environment Variables, add ANTHROPIC_API_KEY, then Redeploy. " +
        "Until then I can't think or look things up — the estimator, JSA, and time clock still work.",
      configured: false,
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  if (process.env.CREW_CODE && body.code !== process.env.CREW_CODE) {
    res.status(200).json({ text: "🔒 Crew code required to use Klyfton AI.", configured: true });
    return;
  }

  const userText = (body.message || "").toString().trim();
  if (!userText) {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  // Build messages: prior history (text-only) + this turn.
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  let messages = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content) }));
  messages.push({ role: "user", content: userText });

  const payload = {
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages,
  };

  try {
    // Server tools can pause_turn; resume a few times so search can finish.
    let data;
    for (let i = 0; i < 4; i++) {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const errText = await r.text();
        res.status(200).json({
          text: "⚠️ Klyfton hit an API error (" + r.status + "). Owner: check the ANTHROPIC_API_KEY.",
          error: errText.slice(0, 400),
          configured: true,
        });
        return;
      }
      data = await r.json();
      if (data.stop_reason === "pause_turn") {
        payload.messages = payload.messages.concat([{ role: "assistant", content: data.content }]);
        continue;
      }
      break;
    }

    let text = textFrom(data.content);
    if (data.stop_reason === "refusal") {
      text = "I can't help with that one. Ask me something on spray foam, coatings, concrete lifting, estimating, or the job.";
    }
    if (!text) text = "I didn't get a usable answer back — try rephrasing.";

    res.status(200).json({ text, configured: true, model: data.model || MODEL });
  } catch (e) {
    res.status(200).json({
      text: "⚠️ Klyfton couldn't reach the network. Try again in a moment.",
      error: String(e).slice(0, 300),
      configured: true,
    });
  }
};
