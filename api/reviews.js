// Review-request generator — after a job closes, this drafts the "how'd we do?" ask that
// gets MGSF Google reviews without the crew having to think about wording.
//
// Pure text, no keys, no npm. Returns SMS + email copy in MGSF's brand voice (veteran-owned,
// direct, no fluff). It NEVER sends anything — outward messages are drafts for a human to fire
// (per the golden rule). It also never invents a review link: pass reviewUrl (the Google Business
// "write a review" short link) or you get an OWNER INPUT REQUIRED marker in its place.
//
// POST { customer, jobType, reviewUrl, tech, tone } -> { sms, email:{subject,body}, ... }
// GET  -> the shape + a note on where to get the reviewUrl.

const MARKER = "OWNER INPUT REQUIRED — paste your Google review link";

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }
function clean(s, max) { return String(s == null ? "" : s).trim().slice(0, max || 120); }

function firstName(full) {
  const f = clean(full).split(/\s+/)[0];
  return f || "there";
}

function build(body) {
  const customer = clean(body.customer, 80);
  const fn = firstName(customer);
  const jobType = clean(body.jobType, 60) || "your project";
  const tech = clean(body.tech, 40) || "the crew";
  const link = clean(body.reviewUrl, 300) || MARKER;
  const company = "Machine Gun Spray Foam";

  // SMS — short, personal, one ask, link last (best tap-through).
  const sms =
    `Hey ${fn}, ${tech} at ${company} here — thanks for trusting us with ${jobType}. ` +
    `If we did right by you, a quick Google review means the world to a small veteran-owned crew: ${link}`;

  // Email — a touch more room, same voice, still one ask.
  const subject = `Thanks from ${company}, ${fn}`;
  const emailBody =
    `${fn},\n\n` +
    `Thanks for having Machine Gun Spray Foam out for ${jobType}. It was a pleasure doing the work, ` +
    `and we want to make sure you're happy with it.\n\n` +
    `We're a small, veteran-owned outfit — word of mouth is how we keep the trucks running. ` +
    `If you've got 60 seconds, a Google review helps more than you'd think:\n\n${link}\n\n` +
    `Anything not sitting right? Reply to this email or call us and we'll make it right.\n\n` +
    `Semper Fi,\nThe crew at Machine Gun Spray Foam`;

  return {
    ok: true,
    draftOnly: true,
    needsReviewUrl: link === MARKER,
    customer,
    channels: {
      sms: { to: clean(body.phone, 20) || null, text: sms, chars: sms.length },
      email: { to: clean(body.email, 80) || null, subject, body: emailBody },
    },
  };
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    res.status(200).json({ ok: true, configured: true, draftOnly: true,
      note: "reviewUrl = your Google Business 'write a review' short link (Google Business Profile → Ask for reviews)." });
    return;
  }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  try { res.status(200).json(build(body)); }
  catch (e) { res.status(200).json({ ok: false, error: String(e).slice(0, 140) }); }
};

module.exports.build = build;
