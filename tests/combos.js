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
ok("14 featured plays", e.counts.featured === 14, e.counts.featured);
ok("every featured corner is a valid one-per-axis corner (mutually adjacent)", C.FEATURED.filter((f) => f.divisions.length === 3).every((f) =>
  C.adjacent(f.divisions[0], f.divisions[1]) && C.adjacent(f.divisions[0], f.divisions[2]) && C.adjacent(f.divisions[1], f.divisions[2])));
// A 2-division featured is normally an EDGE (adjacent faces). The one deliberate exception is an
// AXIS play that spans opposite faces (the tension itself) — allow only the documented ones so a
// NEW accidental opposite pairing still gets caught.
const AXIS_PLAYS = ["true_profit"]; // field↔money = "do the work ↔ count the money"
const badEdges = C.FEATURED.filter((f) => f.divisions.length === 2 && !C.adjacent(f.divisions[0], f.divisions[1]) && AXIS_PLAYS.indexOf(f.key) < 0);
ok("no featured edge is an accidental opposite pair (only documented axis plays)", badEdges.length === 0, badEdges.map((f) => f.key).join(","));
ok("every featured division is a real, distinct key", C.FEATURED.every((f) => new Set(f.divisions).size === f.divisions.length && f.divisions.every((d) => C.DIVISIONS.some((x) => x.key === d))));

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
// gov+risk is an adjacent edge with no featured play → still auto-generated (a "suggested" team)
const genEdge = C.capabilityFor(["gov", "risk"]);
ok("un-featured overlap ⇒ auto-generated suggestion (not featured)", genEdge.featured === false && genEdge.members.length === 2);
ok("generated team = the lead of each division", (function () {
  const leadOf = {}; C.DIVISIONS.forEach((d) => { leadOf[d.key] = d.lead; });
  return genEdge.members.includes(leadOf.gov) && genEdge.members.includes(leadOf.risk);
})());
const face = C.capabilityFor(["money"]);
ok("a face capability lists the whole division + names its lead", face.kind === "face" && face.members.length >= 3 && face.lead === "finance");
ok("no combination is ever undefined", C.all().every((c) => c && c.name && Array.isArray(c.members) && c.members.length >= 1));

// ---- router fast-path (featured triggers only) ----
ok("matchText fires a featured play", (C.matchText("should we bid on the Deere barn?") || {}).key === "go_no_go");
ok("matchText ignores a plain single-topic ask", C.matchText("what's the R-value of closed cell foam?") === null);
ok("matchText caps on very long input", C.matchText("bid ".repeat(80)) === null);
ok("new play: win-rate fires", (C.matchText("how do we improve our proposal win rate and margin?") || {}).key === "win_rate");
ok("new play: book-to-capacity fires", (C.matchText("can we take on another job this week with the crew we have?") || {}).key === "book_capacity");
ok("new play: teaming outreach fires", (C.matchText("find a prime to team up with on a federal solicitation") || {}).key === "teaming_outreach");
ok("promoting a suggestion didn't break a plain single-topic ask", C.matchText("what's the spray window today?") === null);

// ---- convene any piece by key ----
const pl = C.planFor("est+money");
ok("planFor('est+money') ⇒ Priced-to-Margin team", pl && pl.name === "Priced-to-Margin Bid" && pl.minds.includes("estimator") && pl.minds.includes("finance"));
ok("planFor accepts unsorted keys", (C.planFor("money+est") || {}).name === "Priced-to-Margin Bid");
ok("planFor(unknown) ⇒ null", C.planFor("zzz+qqq") === null);

// ---- PARITY GUARD: the visual (public/cube-map.html) featured list stays in lockstep with FEATURED.
// I hand-mirror the featured plays into the cube-map's own COMBOS array; a future combos.js change
// that forgets the visual would silently show a stale/○wrong team on the cube. Lock the two together.
(function () {
  const fs = require("fs");
  let html = null;
  try { html = fs.readFileSync(path.join(__dirname, "..", "public", "cube-map.html"), "utf8"); } catch (x) { html = null; }
  if (html == null) { ok("cube-map.html present for parity guard", false, "not found"); return; }
  const m = html.match(/const\s+COMBOS\s*=\s*\[([\s\S]*?)\];/);
  ok("cube-map.html has a COMBOS array", !!m);
  if (!m) return;
  const visualKeys = (m[1].match(/\{\s*key:\s*"([a-z_]+)"/g) || []).map((s) => s.match(/"([a-z_]+)"/)[1]).sort();
  const featuredKeys = C.FEATURED.map((f) => f.key).sort();
  ok("cube-map featured keys === combos.FEATURED keys (no drift)",
    visualKeys.join(",") === featuredKeys.join(","), "visual=[" + visualKeys.join(",") + "] featured=[" + featuredKeys.join(",") + "]");
})();

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
