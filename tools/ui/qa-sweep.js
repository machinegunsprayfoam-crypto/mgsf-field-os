// Frontend QA sweep — DEV TOOL (not deployed). Loads the real app headless (Playwright), switches
// through every module, and flags layout breaks (page-level horizontal overflow, a module wider than
// its pane) + per-module console errors, screenshotting each. Use after any CSS/layout change to
// confirm the redesign didn't break a panel. Usage:
//   node tools/ui/qa-sweep.js [outDir] [theme] [width] [height]
// e.g. node tools/ui/qa-sweep.js /tmp/sweep "" 1440 900   (default theme, desktop)
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const MODS = "admin agents blueprint bpi calcs calendar certs changeorder chat clock command compliance crm dashboard docs estimate forms gov grow intel invoice jobs jsa materials ops photos pricebook proposal roi scenarios sheets signoff skills spray subs system weather wiki".split(" ");
const APP = "file://" + path.join(__dirname, "..", "..", "public", "index.html");

(async () => {
  const outdir = process.argv[2] || "/tmp/mgsf-sweep";
  const theme = process.argv[3] || "";
  const W = +process.argv[4] || 1440, H = +process.argv[5] || 900;
  fs.mkdirSync(outdir, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  p.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
  p.on("pageerror", e => errs.push("PAGEERR:" + String(e.message).slice(0, 120)));
  await p.goto(APP, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  await p.evaluate((th) => {
    const boot = document.getElementById("boot"); if (boot) { boot.classList.add("hidden"); boot.style.display = "none"; }
    const app = document.getElementById("app"); if (app) { app.classList.add("visible"); app.style.opacity = 1; }
    document.querySelectorAll(".modal-overlay").forEach(m => m.style.display = "none");
    if (th) document.documentElement.setAttribute("data-theme", th);
  }, theme);
  const report = [];
  for (const mod of MODS) {
    const before = errs.length;
    const info = await p.evaluate((mod) => {
      document.querySelectorAll(".module").forEach(m => { m.classList.remove("active"); m.style.display = "none"; });
      const el = document.getElementById("mod-" + mod);
      try { if (typeof switchModule === "function") switchModule(mod); } catch (e) {}
      if (el) { el.classList.add("active"); el.style.display = "flex"; }
      const c = document.getElementById("content");
      let widest = 0;
      if (el) el.querySelectorAll("*").forEach(n => { const w = n.getBoundingClientRect().width; if (w > widest) widest = w; });
      return {
        exists: !!el,
        bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        modOverflow: el ? el.scrollWidth - el.clientWidth : -1,
        widest: Math.round(widest), contentW: c ? c.clientWidth : 0,
      };
    }, mod);
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(outdir, mod + ".png") });
    report.push({ mod, ...info, newErrs: errs.length - before });
  }
  fs.writeFileSync(path.join(outdir, "_report.json"), JSON.stringify(report, null, 1));
  const flagged = report.filter(r => !r.exists || r.bodyOverflow > 2 || r.modOverflow > 4 || r.widest > r.contentW + 8);
  console.log("modules:", report.length, "| flagged:", flagged.length, "| theme:", theme || "(default)", "| " + W + "x" + H);
  flagged.forEach(r => console.log("  ⚠", r.mod, "bodyOvf=" + r.bodyOverflow, "modOvf=" + r.modOverflow, "widest=" + r.widest, "content=" + r.contentW, r.exists ? "" : "MISSING"));
  await b.close();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
