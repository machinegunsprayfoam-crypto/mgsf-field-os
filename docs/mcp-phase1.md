# Klyfton MCP Server — Phase 1

Endpoint: `POST /api/mcp` (MCP streamable-HTTP, stateless JSON mode)
Auth: `Authorization: Bearer <MCP_BEARER_TOKEN>` (Vercel env var; rotate there)
Status probe: `GET /api/mcp` → `{ ok, server, phase, kv, auth_required }`

9 read-only tools over the KV collections: list_leads, get_lead, list_estimates,
get_estimate, get_job, job_cost_summary, inventory_levels, review_ask_status,
list_scheduled_jobs.

Rules of record (see MGSF_Klyfton_MCP_Server_Spec in Drive): READ-ONLY in Phase 1;
writes are Phase 2, gated behind two clean weeks; pricing doctrine never exposed;
crew credentials never leave storage; tombstones respected.
