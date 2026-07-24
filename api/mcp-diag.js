// TEMPORARY diagnostic — confirms whether MCP_BEARER_TOKEN reaches the deployment.
// Reveals ONLY: presence, character length, and env var NAMES containing 'MCP'.
// Never values. Delete this file once the MCP connector is verified.
module.exports = async (req, res) => {
  const v = process.env.MCP_BEARER_TOKEN;
  const names = Object.keys(process.env).filter(function (k) { return /mcp/i.test(k); });
  res.status(200).json({
    ok: true,
    mcp_bearer_token: { present: v != null && v !== "", length: v ? String(v).length : 0 },
    mcp_like_env_names: names,
    vercel_env: process.env.VERCEL_ENV || null,
  });
};
