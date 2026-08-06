// Klyfton OPENAPI — the machine-readable contract for the whole API surface, GENERATED from the
// tool bag (api/tools.js) rather than hand-written. That's the point: a hand-written spec rots the
// first time someone adds an endpoint, while this one is derived from the same catalog the brain
// and the CMDB already read, so it CANNOT drift from the real tool list. Add a tool to the bag and
// it appears here on the next request; delete one and it disappears.
//
// What consumers get: Zapier / Make / a custom GPT / a GC's procurement system / a future mobile
// app can discover what this API offers and how to authenticate, without anyone maintaining docs.
//
// HONEST BY DESIGN — this is a DISCOVERY-LEVEL spec. Paths, operations, auth, categories and live
// status are authoritative (they come from the catalog + the Mechanic). Per-endpoint request and
// response SCHEMAS are NOT yet documented: each operation therefore declares a free-form object
// and carries `x-klyfton-schema: "undocumented"`. We do not invent field names we haven't verified
// — a fabricated schema is worse than an absent one, because a caller would trust it.
//
// Pure/deterministic against an env-like object (no network, no Date.now) — unit-testable offline.
// GET /api/openapi -> the spec. Read-only; exposes no secrets, no keys, no pricing.

let TOOLS_MOD = null;
try { TOOLS_MOD = require("./tools"); } catch (e) { TOOLS_MOD = null; }

const OPENAPI_VERSION = "3.1.0";
const API_VERSION = "1.0.0";

// A tool's module path is the source of its route: "api/foo-calc.js" -> "/api/foo-calc".
// Vercel maps api/*.js to /api/* one-for-one, so this is a fact about the deployment, not a guess.
function routeOf(modulePath) {
  const m = /^api\/([A-Za-z0-9._-]+)\.js$/.exec(String(modulePath || ""));
  return m ? "/api/" + m[1] : null;
}

// Some tools share one module (e.g. geo-mobilization + maps both live in api/geo.js; arms +
// zapier-bus both in api/act.js). One route, several capabilities — group instead of colliding.
function groupByRoute(tools) {
  const byRoute = new Map();
  for (const t of tools || []) {
    const route = routeOf(t.module);
    if (!route) continue;
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push(t);
  }
  return byRoute;
}

function sentence(s) {
  const text = String(s || "").trim();
  if (!text) return "";
  return text.length > 300 ? text.slice(0, 297) + "..." : text;
}

// Build one operation object. `verified:false` is deliberate and machine-readable: it tells a
// consumer "this route exists and is described, but do not trust a generated body shape".
function operation(route, group, method) {
  const primary = group[0];
  const ids = group.map((t) => t.id);
  const anyLive = group.some((t) => t.live);
  const op = {
    operationId: method.toLowerCase() + "_" + primary.id.replace(/[^A-Za-z0-9]+/g, "_"),
    summary: sentence(primary.does) || primary.id,
    tags: Array.from(new Set(group.map((t) => t.category))).sort(),
    "x-klyfton-tools": ids,
    "x-klyfton-status": anyLive ? "live" : "dark",
    "x-klyfton-schema": "undocumented",
    responses: {
      200: {
        description: "Success. Response shape is not yet documented per-endpoint.",
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
      401: {
        description: "CREW_CODE is set and the request did not present it.",
        content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
      },
      405: { description: "Method not allowed for this endpoint." },
    },
  };
  if (!anyLive) {
    // Surface exactly which switch turns this on — same arm string the CMDB shows the owner.
    const arm = group.map((t) => t.gatedBy).filter((a) => a && a !== "none")[0];
    if (arm) op["x-klyfton-arm"] = arm;
  }
  if (method === "POST") {
    op.requestBody = {
      required: false,
      content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
    };
  }
  return op;
}

// PURE: build the whole document against an env-like object. Deterministic — same env, same bytes.
function spec(env, opts) {
  env = env || {};
  opts = opts || {};
  const cat = TOOLS_MOD && typeof TOOLS_MOD.catalog === "function" ? TOOLS_MOD.catalog(env) : { tools: [], count: 0, live: 0, dark: 0 };
  const byRoute = groupByRoute(cat.tools);

  const paths = {};
  for (const route of Array.from(byRoute.keys()).sort()) {
    const group = byRoute.get(route);
    // Both verbs are declared because the handlers in this codebase generally accept either a
    // GET probe and a POST payload. Which one a given endpoint honours is not yet verified
    // per-route, hence x-klyfton-schema: "undocumented" on each operation.
    paths[route] = { get: operation(route, group, "GET"), post: operation(route, group, "POST") };
  }

  const doc = {
    openapi: OPENAPI_VERSION,
    info: {
      title: "MGSF Field-OS (Klyfton) API",
      version: String(opts.version || API_VERSION),
      summary: "Field operations API for Machine Gun Spray Foam & Concrete Lifting, LLC.",
      description:
        "Generated from the Klyfton tool bag (api/tools.js), which reads live gating from the " +
        "Mechanic (api/health.js) — so this spec cannot drift from the real tool list.\n\n" +
        "DISCOVERY-LEVEL: paths, operations, authentication, categories and live status are " +
        "authoritative. Per-endpoint request/response schemas are NOT documented — every " +
        "operation declares a free-form object and carries x-klyfton-schema: \"undocumented\". " +
        "Do not generate typed clients from this spec expecting field-level accuracy.\n\n" +
        "Endpoints marked x-klyfton-status: \"dark\" are deployed but inert until their " +
        "capability is armed; x-klyfton-arm names the exact switch.",
    },
    servers: (opts.servers && opts.servers.length ? opts.servers : [{ url: String(opts.baseUrl || "/"), description: "This deployment" }]),
    tags: Array.from(new Set(cat.tools.map((t) => t.category))).sort().map((c) => ({ name: c })),
    components: {
      securitySchemes: {
        crewCode: {
          type: "apiKey",
          in: "header",
          name: "x-crew-code",
          description:
            "Shared crew access code. DORMANT until CREW_CODE is set in the environment: while " +
            "it is unset the gate allows every request (no lockout). Once set, gated endpoints " +
            "require this header (?code= and body.code are also accepted, but the header is " +
            "preferred — query strings land in access logs).",
        },
      },
    },
    security: [{ crewCode: [] }],
    paths,
    "x-klyfton": {
      generatedFrom: "api/tools.js",
      toolCount: cat.count || 0,
      liveCount: cat.live || 0,
      darkCount: cat.dark || 0,
      routeCount: Object.keys(paths).length,
      schemaCoverage: "none — discovery-level only",
    },
  };
  return doc;
}

// Validate the generated document is well-formed (the test gate runs this so a malformed
// catalog entry can never ship a broken spec).
function validate(env) {
  const doc = spec(env);
  const errors = [];
  if (doc.openapi !== OPENAPI_VERSION) errors.push("wrong openapi version");
  if (!doc.info || !doc.info.title || !doc.info.version) errors.push("info incomplete");
  if (!doc.components || !doc.components.securitySchemes || !doc.components.securitySchemes.crewCode) errors.push("missing crewCode security scheme");
  const seen = new Set();
  for (const route of Object.keys(doc.paths || {})) {
    if (!/^\/api\/[A-Za-z0-9._-]+$/.test(route)) errors.push("bad route: " + route);
    for (const method of Object.keys(doc.paths[route])) {
      const op = doc.paths[route][method];
      if (!op.operationId) errors.push(route + " " + method + ": no operationId");
      else if (seen.has(op.operationId)) errors.push("duplicate operationId: " + op.operationId);
      else seen.add(op.operationId);
      if (!op.summary) errors.push(route + " " + method + ": no summary");
      if (!op.responses || !op.responses[200]) errors.push(route + " " + method + ": no 200 response");
      if (!Array.isArray(op.tags) || !op.tags.length) errors.push(route + " " + method + ": no tags");
    }
  }
  return { ok: errors.length === 0, routes: Object.keys(doc.paths || {}).length, operations: seen.size, errors };
}

// HTTP: GET /api/openapi -> the spec. Gated like every other data endpoint (dormant until
// CREW_CODE is set). Honours a ?baseUrl= override so a consumer can pin absolute server URLs.
function handler(req, res) {
  const guard = require("./guard");
  if (!guard.ok(req)) {
    if (res && res.setHeader) { res.setHeader("Content-Type", "application/json"); res.statusCode = 401; res.end(JSON.stringify(guard.denied())); }
    return guard.denied();
  }
  const q = (req && req.query) || {};
  const opts = {};
  if (q.baseUrl) opts.baseUrl = String(q.baseUrl).slice(0, 300);
  const doc = spec(process.env, opts);
  const body = JSON.stringify(doc, null, 2);
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(body);
  }
  return doc;
}

module.exports = handler;
module.exports.handler = handler;
module.exports.spec = spec;
module.exports.validate = validate;
module.exports.routeOf = routeOf;
module.exports.groupByRoute = groupByRoute;

// Direct run: print a summary + validation. `node api/openapi.js`
if (require.main === module) {
  const v = validate(process.env);
  const doc = spec(process.env);
  console.log("Klyfton OpenAPI " + doc.openapi + " — " + v.routes + " routes, " + v.operations + " operations");
  console.log("generated from " + doc["x-klyfton"].generatedFrom + " (" + doc["x-klyfton"].toolCount + " tools: " +
    doc["x-klyfton"].liveCount + " live, " + doc["x-klyfton"].darkCount + " dark)");
  console.log(v.ok ? "✓ spec valid" : "✗ errors: " + v.errors.join("; "));
}
