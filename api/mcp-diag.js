// TEMPORARY diagnostic — confirms whether the MCP bearer token reaches the deployment.
// Reveals ONLY: presence, matched env var NAME, character lengths (raw + trimmed), and
// env var NAMES containing 'MCP'. Never values. Delete once the MCP connector is verified.
module.exports = async (req, res) => {
  let matchedName = null, raw = "";
  for (const k of Object.keys(process.env)) {
    if (/^MCP[_-]?BEARER[_-]?TOKEN$/i.test(k) && process.env[k]) { matchedName = k; raw = String(process.env[k]); break; }
  }
  const trimmed = raw.trim();
  const names = Object.keys(process.env).filter(function (k) { return /mcp/i.test(k); });
  res.status(200).json({
    ok: true,
    token: { present: trimmed !== "", matched_name: matchedName, raw_length: raw.length, trimmed_length: trimmed.length },
    mcp_like_env_names: names,
    vercel_env: process.env.VERCEL_ENV || null,
  });
};
