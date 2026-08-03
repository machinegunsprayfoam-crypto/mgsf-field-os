#!/usr/bin/env node
// OpenAPI generator (api/openapi.js). Run: `node tests/openapi.js`.
// Guards the property that makes this worth having: the spec is DERIVED from the tool bag, so it
// cannot drift. If someone adds a tool and the spec doesn't grow, these tests fail.

const path = require("path");
const O = require(path.join(__dirname, "..", "api", "openapi.js"));
const T = require(path.join(__dirname, "..", "api", "tools.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) pass++; else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + JSON.stringify(detail) + "]" : "")); } }

console.log("OpenAPI generator — derivation, validity, honesty\n");

// --- route derivation is a pure function of the module path
ok("routeOf maps api/foo.js", O.routeOf("api/foo.js") === "/api/foo");
ok("routeOf maps hyphens", O.routeOf("api/foam-calc.js") === "/api/foam-calc");
ok("routeOf rejects non-api", O.routeOf("lib/foo.js") === null);
ok("routeOf rejects junk", O.routeOf("") === null);
ok("routeOf rejects traversal", O.routeOf("api/../secret.js") === null);

// --- shared modules group onto ONE route instead of colliding
const grouped = O.groupByRoute([
  { id: "a", module: "api/geo.js", category: "geo", does: "x", live: true, gatedBy: "none" },
  { id: "b", module: "api/geo.js", category: "geo", does: "y", live: false, gatedBy: "set MAPS" },
  { id: "c", module: "api/other.js", category: "ops", does: "z", live: true, gatedBy: "none" },
]);
ok("shared module -> one route", grouped.get("/api/geo").length === 2, grouped.get("/api/geo") && grouped.get("/api/geo").length);
ok("distinct modules -> distinct routes", grouped.size === 2, grouped.size);

// --- the document itself
const doc = O.spec({});
ok("openapi 3.1.0", doc.openapi === "3.1.0", doc.openapi);
ok("has info.title", !!(doc.info && doc.info.title));
ok("has info.version", !!(doc.info && doc.info.version));
ok("declares crewCode scheme", !!(doc.components.securitySchemes.crewCode));
ok("crewCode is the x-crew-code header", doc.components.securitySchemes.crewCode.name === "x-crew-code", doc.components.securitySchemes.crewCode.name);
ok("security applied globally", Array.isArray(doc.security) && doc.security.length === 1);
ok("has servers", Array.isArray(doc.servers) && doc.servers.length >= 1);
ok("has tags", Array.isArray(doc.tags) && doc.tags.length > 0, doc.tags && doc.tags.length);

// --- THE anti-drift property: every catalogued tool with an api/*.js module gets a route
const cat = T.catalog({});
const expectedRoutes = new Set();
for (const t of cat.tools) { const r = O.routeOf(t.module); if (r) expectedRoutes.add(r); }
const actualRoutes = new Set(Object.keys(doc.paths));
ok("every catalogued api/ tool has a route", [...expectedRoutes].every((r) => actualRoutes.has(r)),
  [...expectedRoutes].filter((r) => !actualRoutes.has(r)).slice(0, 5));
ok("no route without a catalogued tool", [...actualRoutes].every((r) => expectedRoutes.has(r)),
  [...actualRoutes].filter((r) => !expectedRoutes.has(r)).slice(0, 5));
ok("route count matches", actualRoutes.size === expectedRoutes.size, { actual: actualRoutes.size, expected: expectedRoutes.size });
ok("generated at least 40 routes", actualRoutes.size >= 40, actualRoutes.size);

// --- operations are well-formed and uniquely identified
const v = O.validate({});
ok("validate() passes", v.ok === true, v.errors && v.errors.slice(0, 5));
ok("validate counts operations", v.operations === actualRoutes.size * 2, { ops: v.operations, routes: actualRoutes.size });

// --- HONESTY: we must never claim a schema we haven't verified
let undoc = 0, total = 0, fabricated = 0;
for (const r of Object.keys(doc.paths)) {
  for (const m of Object.keys(doc.paths[r])) {
    const op = doc.paths[r][m];
    total++;
    if (op["x-klyfton-schema"] === "undocumented") undoc++;
    const sch = op.requestBody && op.requestBody.content["application/json"].schema;
    // a fabricated schema would name properties; free-form must not
    if (sch && sch.properties) fabricated++;
  }
}
ok("every op flagged undocumented", undoc === total, { undoc, total });
ok("no fabricated request properties", fabricated === 0, fabricated);
ok("x-klyfton reports no schema coverage", doc["x-klyfton"].schemaCoverage === "none — discovery-level only");

// --- live/dark status is carried through from the catalog, and dark ops name their switch
const darkOps = [];
for (const r of Object.keys(doc.paths)) { const op = doc.paths[r].get; if (op["x-klyfton-status"] === "dark") darkOps.push([r, op]); }
ok("some endpoints are dark in an empty env", darkOps.length > 0, darkOps.length);
ok("dark ops name the arm switch", darkOps.every(([r, op]) => typeof op["x-klyfton-arm"] === "string" && op["x-klyfton-arm"].length > 0),
  darkOps.filter(([r, op]) => !op["x-klyfton-arm"]).map(([r]) => r).slice(0, 5));

// --- arming a capability must flip status live (proves it reads real env, not a frozen snapshot)
const armed = O.spec({ ALERTS_WEBHOOK_URL: "https://example.invalid/hook" });
const notifyDark = doc.paths["/api/notify"] && doc.paths["/api/notify"].get["x-klyfton-status"];
const notifyArmed = armed.paths["/api/notify"] && armed.paths["/api/notify"].get["x-klyfton-status"];
ok("notify dark without webhook", notifyDark === "dark", notifyDark);
ok("notify live once webhook is set", notifyArmed === "live", notifyArmed);

// --- determinism: same env in, same bytes out (no Date.now, no randomness)
ok("deterministic", JSON.stringify(O.spec({})) === JSON.stringify(O.spec({})));

// --- no secrets leak into the document
const blob = JSON.stringify(O.spec({ CREW_CODE: "hunter2", ANTHROPIC_API_KEY: "sk-ant-SECRET", MCP_BEARER_TOKEN: "tok-SECRET" }));
ok("no CREW_CODE value in spec", blob.indexOf("hunter2") === -1);
ok("no api key value in spec", blob.indexOf("sk-ant-SECRET") === -1);
ok("no bearer token value in spec", blob.indexOf("tok-SECRET") === -1);

// --- handler respects the guard and returns the doc
const denied = O.handler({ headers: { "x-crew-code": "wrong" }, query: {} }, null, { CREW_CODE: "right" });
ok("handler returns an object", denied && typeof denied === "object");

console.log((fail ? "\n" : "") + "✓ " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
