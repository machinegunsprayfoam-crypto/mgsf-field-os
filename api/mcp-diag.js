// Retired 2026-07-24 after MCP Phase 1 go-live verification. Kept as a stub so the
// route 410s instead of exposing env metadata. Full history in git; re-add from
// commit 01c22e3 if token wiring ever needs eyes again.
module.exports = async (req, res) => { res.status(410).json({ gone: true, note: "diagnostic retired after Phase 1 verification" }); };
