#!/usr/bin/env node
// The cube's capability algebra (api/combos.js). Locks the enumeration — 6 faces + 12 edges + 8
// corners = 26 pieces — the axis/adjacency rules, featured overrides vs. auto-generated suggestions,
// the router fast-path matcher, convene-by-key, and the drift guard that combos' division rosters
// stay in lockstep with klyfton's SPECIALISTS. Keyless, deterministic. Run: node tests/combos.js

const path = require("path");
const C = require(path.join(__dirname, "..", "api", "combos.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Cube capability algebra\n");

// ---- exact Rubik's piece counts ----
const e = C.enumerate();
ok("6 faces", e.faces.length === 6, e.faces.length);
ok("12 edges", e.edges.length === 12, e.edges.length);
ok("8 corners", e.corners.length === 8, e.corners.length);
ok("26 pieces total", e.counts.total === 26, e.counts.total);
ok("all() returns 26", C.all().length === 26);
ok("10 featured plays", e.counts.featured === 10, e.counts.featured);

// ---- axes / adjacency ----
ok("3 axes (opposite-face pairs)", C.AXES.length === 3);
ok("opposite faces are NOT adjacent", C.AXES.every((ax) => C.adjacent(ax.a, ax.b) === false));
ok("est adjacent to field (not opposite)", C.adjacent("est", "field") === true);
ok("est NOT adjacent to gov (opposite pair)", C.adjacent("est", "gov") === false);
ok("a division is not adjacent to itself", C.adjacent("est", "est") === false);

// ---- every corner is one division per axis (mutually adjacent, no opposite pair inside) ----
ok("every corner has 3 mutually-adjacent divisions", C.corners().every((tri) =>
  C.adjacent(tri[0], tri[1]) && C.adjacent(tri[0], tri[2]) && C.adjacent(tri[1], tri[2])));
ok("no edge is an opposite pair", C.edges().every(([a, b]) => C.adjacent(a, b)));

// ---- featured override vs generated suggestion ----
const gng = C.capabilityFor(["est", "money", "risk"]);
ok("featured corner (Go/No-Go) overrides generation", gng.featured === true && gng.name === "Go/No-Go Bid" && gng.kind === "corner");
ok("featured carries its tuned team", gng.members.join(",") === "estimator,finance,code");
// est+gov is an opposite pair → never an edge piece, but capabilityFor still answers for any set
const genEdge = C.capabilityFor(["field", "growth"]);
ok("un-featured overlap ⇒ auto-generated suggestion (not featured)", genEdge.featured === false && genEdge.members.length === 2);
ok("generated team = the lead of each division", (function () {
  const leadOf = {}; C.DIVISIONS.forEach((d) => { leadOf[d.key] = d.lead; });
  return genEdge.members.includes(leadOf.field) && genEdge.members.includes(leadOf.growth);
})());
const face = C.capabilityFor(["money"]);
ok("a face capability lists the whole division + names its lead", face.kind === "face" && face.members.length >= 3 && face.lead === "finance");
ok("no combination is ever undefined", C.all().every((c) => c && c.name && Array.isArray(c.members) && c.members.length >= 1));

// ---- router fast-path (featured triggers only) ----
ok("matchText fires a featured play", (C.matchText("should we bid on the Deere barn?") || {}).key === "go_no_go");
ok("matchText ignores a plain single-topic ask", C.matchText("what's the R-value of closed cell foam?") === null);
ok("matchText caps on very long input", C.matchText("bid ".repeat(80)) === null);

// ---- convene any piece by key ----
const pl = C.planFor("est+money");
ok("planFor('est+money') ⇒ Priced-to-Margin team", pl && pl.name === "Priced-to-Margin Bid" && pl.minds.includes("estimator") && pl.minds.includes("finance"));
ok("planFor accepts unsorted keys", (C.planFor("money+est") || {}).name === "Priced-to-Margin Bid");
ok("planFor(unknown) ⇒ null", C.planFor("zzz+qqq") === null);

// ---- DRIFT GUARD: combos.DIVISIONS members stay in lockstep with klyfton SPECIALISTS ----
(function () {
  let K = null; try { K = require(path.join(__dirname, "..", "api", "klyfton.js")); } catch (x) { K = null; }
  if (!K || !K.SPECIALISTS) { ok("klyfton SPECIALISTS reachable for drift guard", false, "not exported"); return; }
  const byDiv = {};
  Object.keys(K.SPECIALISTS).forEach((k) => { const d = K.SPECIALISTS[k].division; if (d && d !== "core") (byDiv[d] = byDiv[d] || []).push(k); });
  const mismatch = C.DIVISIONS.filter((d) => (byDiv[d.key] || []).slice().sort().join(",") !== d.members.slice().sort().join(","));
  ok("combos.DIVISIONS members === klyfton SPECIALISTS grouping (no drift)", mismatch.length === 0, mismatch.map((m) => m.key).join(","));
  ok("every combo member is a real specialist key", C.all().every((c) => c.members.every((m) => !!K.SPECIALISTS[m])));
  ok("every division lead is a real specialist key", C.DIVISIONS.every((d) => !!K.SPECIALISTS[d.lead]));
})();

console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
