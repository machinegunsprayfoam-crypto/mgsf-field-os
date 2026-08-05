#!/usr/bin/env node
// Coding-lessons cross-session memory (api/lessons.js) — roadmap "B": keep it in OUR Supabase, no
// third-party hivemind. Covers the PURE CORE (normalize/validate, stable normalized id, tag
// hygiene, canonical embed text) and the GATED contract (inert + graceful + never-fabricate when
// Supabase isn't configured — which is the state the keyless test gate runs in). Run: `node tests/lessons.js`.

const path = require("path");
const L = require(path.join(__dirname, "..", "api", "lessons.js"));
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; } else { fail++; console.log("  ✗ " + name + (detail !== undefined ? "  [" + detail + "]" : "")); } }

console.log("Coding lessons — cross-session memory (pure core + gated contract)\n");

// ---- normalizeLesson: validation + shaping ----
(() => {
  const good = L.normalizeLesson({ problem: "Crew code gate stayed dark", fix: "CREW_CODE was set to Preview scope, not Production", area: "vercel", tags: ["env", "go-live", "ENV"] });
  ok("valid lesson normalizes ok", good.ok === true);
  ok("keeps problem + fix", good.ok && good.lesson.problem === "Crew code gate stayed dark" && /Preview scope/.test(good.lesson.fix));
  ok("id is 40-char hex", good.ok && /^[0-9a-f]{40}$/.test(good.lesson.id), good.ok && good.lesson.id);
  ok("area carried", good.ok && good.lesson.area === "vercel");
  ok("tags normalized: lowercased + de-duped", good.ok && JSON.stringify(good.lesson.tags) === JSON.stringify(["env", "go-live"]));

  ok("missing problem rejected", L.normalizeLesson({ fix: "x" }).error === "missing_problem");
  ok("missing fix rejected", L.normalizeLesson({ problem: "x" }).error === "missing_fix");
  ok("empty input rejected (no throw)", L.normalizeLesson().ok === false);
})();

// ---- lessonKey: stable + normalized (case/whitespace-insensitive) ----
(() => {
  const a = L.lessonKey("Crew code 401");
  const b = L.lessonKey("  crew   code   401 ");
  ok("same problem (diff case/space) → same id (updates, no dupe)", a === b, a + " vs " + b);
  ok("different problem → different id", L.lessonKey("something else") !== a);
  ok("lessonKey is 40-char hex", /^[0-9a-f]{40}$/.test(a));
})();

// ---- normTags: array or comma-string, dedupe, lowercase, cap 10 ----
(() => {
  ok("comma-string parses", JSON.stringify(L.normTags("A, b , a")) === JSON.stringify(["a", "b"]));
  ok("caps at 10 tags", L.normTags(Array.from({ length: 20 }, (_, i) => "t" + i)).length === 10);
  ok("non-array/non-string → []", JSON.stringify(L.normTags(null)) === "[]");
})();

// ---- lessonText: canonical embed/context string, deterministic ----
(() => {
  const t = L.lessonText({ problem: "P", fix: "F", area: "db", tags: ["x", "y"] });
  ok("lessonText leads with PROBLEM + FIX", /^PROBLEM: P\nFIX: F/.test(t));
  ok("includes AREA + TAGS when present", /AREA: db/.test(t) && /TAGS: x, y/.test(t));
  const t2 = L.lessonText({ problem: "P", fix: "F" });
  ok("omits AREA/TAGS when absent", !/AREA:/.test(t2) && !/TAGS:/.test(t2));
  ok("deterministic (same input → same text)", L.lessonText({ problem: "P", fix: "F" }) === t2);
})();

// ---- gated contract: inert + graceful + never fabricates when Supabase is unconfigured ----
(async () => {
  const cap = await L.capture({ problem: "p", fix: "f" });
  ok("capture is inert without Supabase (configured:false, no throw)", cap.ok === false && cap.configured === false);
  const capBad = await L.capture({ problem: "" });
  ok("capture validates before touching the DB", capBad.ok === false && capBad.error === "missing_problem");
  const sug = await L.suggest("some problem");
  ok("suggest is inert without Supabase + returns no fabricated results", sug.configured === false && Array.isArray(sug.results) && sug.results.length === 0);
  const c = await L.count();
  ok("count is inert without Supabase (count:0)", c.configured === false && c.count === 0);

  console.log("\n" + (fail ? "✗ " : "✓ ") + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
