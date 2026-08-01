#!/usr/bin/env node
// Brain-graph artifact sync guard. The InfraNodus brain graph is baked into THREE files that must stay
// identical: api/brain-graph-data.js (retriever + boot), public/brain-graph.json (source copy), and
// public/brain-graph.js (window.BRAIN_GRAPH — the 3D boot visualization). A re-scan that regenerates one
// but forgets another silently drifts the boot viz from the retriever (no error, just a stale map that
// no longer matches what the brain actually routes on). This asserts all three carry the SAME graph.
// Run: `node tests/brain-graph-sync.js`. Deterministic, keyless, no network.

const fs = require("fs");
const path = require("path");
const R = (p) => path.join(__dirname, "..", p);

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Brain-graph artifact sync (data.js / brain-graph.json / brain-graph.js)\n");

const dataJs = require(R("api/brain-graph-data.js"));
const json = JSON.parse(fs.readFileSync(R("public/brain-graph.json"), "utf8"));
const jsRaw = fs.readFileSync(R("public/brain-graph.js"), "utf8");
const m = jsRaw.match(/window\.BRAIN_GRAPH\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
ok("public/brain-graph.js assigns window.BRAIN_GRAPH", !!m);
const viz = m ? JSON.parse(m[1]) : null;

const A = JSON.stringify(dataJs);
const B = JSON.stringify(json);
const C = viz ? JSON.stringify(viz) : null;

ok("api/brain-graph-data.js === public/brain-graph.json", A === B);
ok("api/brain-graph-data.js === public/brain-graph.js (window.BRAIN_GRAPH)", A === C);

// structural sanity so the guard can't pass on an empty/degenerate graph
ok("graph is non-trivial (>=100 nodes, >=100 edges, >=5 clusters)",
  dataJs.meta && dataJs.meta.nodes >= 100 && dataJs.meta.edges >= 100 && (dataJs.clusters || []).length >= 5,
  JSON.stringify(dataJs.meta || {}));
ok("meta.nodes matches the actual nodes array length", dataJs.nodes && dataJs.nodes.length === dataJs.meta.nodes, dataJs.nodes && (dataJs.nodes.length + " vs " + dataJs.meta.nodes));
ok("meta.edges matches the actual edges array length", dataJs.edges && dataJs.edges.length === dataJs.meta.edges, dataJs.edges && (dataJs.edges.length + " vs " + dataJs.meta.edges));
ok("meta.clusters matches the actual clusters array length", (dataJs.clusters || []).length === dataJs.meta.clusters);
// every edge endpoint is a valid node index (no dangling edge after a regen)
const N = dataJs.nodes.length;
const badEdge = (dataJs.edges || []).find((e) => !(e[0] >= 0 && e[0] < N && e[1] >= 0 && e[1] < N));
ok("every edge endpoint indexes a real node (no dangling edges)", !badEdge, badEdge ? JSON.stringify(badEdge) : "");
// every node's cluster id exists in the clusters table
const cids = new Set((dataJs.clusters || []).map((c) => c.id));
const badNode = (dataJs.nodes || []).find((n) => !cids.has(n.c));
ok("every node's cluster id exists in the clusters table", !badNode, badNode ? JSON.stringify(badNode) : "");

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
