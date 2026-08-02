// Headless screenshot of the UI preview harness. Usage: node tools/ui/shot-preview.js [theme] [out.png]
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const path = require("path");
(async () => {
  const theme = process.argv[2] || "grid";
  const out = process.argv[3] || "/tmp/ui-preview.png";
  const file = "file://" + path.join(__dirname, "ui-preview.html");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
  await p.goto(file, { waitUntil: "networkidle" });
  await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await p.waitForTimeout(300);
  await p.screenshot({ path: out, fullPage: true });
  await b.close(); console.log("preview shot:", out, "theme:", theme);
})().catch(e => { console.error(e.message); process.exit(1); });
