// Klyfton REDACT — the guardrail that strips secrets before text reaches an LLM or a log.
//
// Gap surfaced by the InfraNodus brain scan ("PII redaction before LLM calls" +
// doctrine "credentials never in chat"). A customer's foam question never legitimately
// contains an API key, SSN, or credit-card number — if one shows up (pasted by mistake,
// or in a forwarded email), it must NOT be sent to a third-party model or written to logs.
//
// Design: PURE + deterministic (no keys, no network, no npm) so it's fully unit-tested.
//   - Secrets are ALWAYS masked: API keys/tokens, private-key blocks, SSNs, and
//     Luhn-valid credit-card numbers (Luhn check avoids masking ordinary long numbers).
//   - Contact PII (email / phone) is legitimate business data, so it's masked ONLY when
//     opts.contact === true (e.g. before an external non-MGSF model), never by default.
//
// redact(text, opts) -> { text, found:[{type,count}], redacted:bool }
// GET /api/redact?text=... (or POST {text, contact?}) -> the same, for quick checks.

// Luhn validation so a 16-digit measurement/id isn't mistaken for a card number.
function luhnValid(num) {
  const d = String(num).replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// Ordered rules. Each: type, regex, and an optional validate(match) gate. Secret rules
// run always; contact rules only when opts.contact. Order matters (keys before generic).
const SECRET_RULES = [
  { type: "private_key", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },
  { type: "api_key", re: /\b(?:sk|pat|rk|ghp|gho|ghu|ghs|xoxb|xoxp|AKIA|ASIA)[-_][A-Za-z0-9\-_]{10,}\b/g },
  { type: "api_key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { type: "api_key", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g }, // GitHub fine-grained PAT
  { type: "api_key", re: /\bglpat-[A-Za-z0-9\-_]{16,}\b/g },    // GitLab PAT
  { type: "bearer", re: /\bBearer\s+[A-Za-z0-9\-._~+/]{16,}=*/g },
  { type: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "credit_card", re: /\b(?:\d[ -]?){13,19}\b/g, validate: (m) => luhnValid(m) },
];
const CONTACT_RULES = [
  { type: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: "phone", re: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
];

function apply(text, rules, found) {
  let out = text;
  for (const rule of rules) {
    out = out.replace(rule.re, (m) => {
      if (rule.validate && !rule.validate(m)) return m; // not a real match (e.g. failed Luhn)
      found[rule.type] = (found[rule.type] || 0) + 1;
      return "[REDACTED_" + rule.type.toUpperCase() + "]";
    });
  }
  return out;
}

// Pure. Returns masked text + what was found. opts.contact also masks email/phone.
function redact(text, opts) {
  const s = text == null ? "" : String(text);
  if (!s) return { text: "", found: [], redacted: false };
  const found = {};
  let out = apply(s, SECRET_RULES, found);
  if (opts && opts.contact) out = apply(out, CONTACT_RULES, found);
  const foundList = Object.keys(found).map((type) => ({ type, count: found[type] }));
  return { text: out, found: foundList, redacted: foundList.length > 0 };
}

// Convenience for the hive: mask secrets from user text before it hits the model, and
// return both the safe text and a boolean so the caller can log/flag. Secrets only.
function sanitizeForModel(text) {
  const r = redact(text, { contact: false });
  return { text: r.text, redacted: r.redacted, found: r.found };
}

module.exports = async (req, res) => {
  try {
    const body = (req && req.body) || {};
    let text = body.text;
    if (text == null && req && req.url) { const m = req.url.match(/[?&]text=([^&]+)/); if (m) text = decodeURIComponent(m[1]); }
    const contact = !!(body.contact || (req && req.url && /[?&]contact=(1|true)/.test(req.url)));
    if (text == null || text === "") return res.status(400).json({ ok: false, reason: "no_text" });
    return res.status(200).json({ ok: true, ...redact(text, { contact }) });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: "error", detail: (e && e.message) || "err" });
  }
};

module.exports.redact = redact;
module.exports.sanitizeForModel = sanitizeForModel;
module.exports.luhnValid = luhnValid;
