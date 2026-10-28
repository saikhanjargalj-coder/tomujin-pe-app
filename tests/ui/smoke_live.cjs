// Read-only check of the LIVE site as a visitor who is not signed in: pages load, no script errors,
// club registration block and access texts are there. It never signs in and never writes data.
//   NODE_PATH=~/smoke/node_modules node tests/ui/smoke_live.cjs [https://tomujin-pe.web.app/]
const { chromium } = require("playwright");
const BASE = process.argv[2] || "https://tomujin-pe.web.app/";
(async () => {
  const b = await chromium.launch();
  const out = [], errs = [];
  for (const [w, label] of [[1280, "desktop"], [390, "phone"]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 860 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(label + " " + e.message));
    pg.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errs.push(label + " console: " + m.text()); });
    for (const v of ["home", "clubs", "guide", "updates", "podcast", "matches"]) {
      await pg.goto(BASE + "#" + v, { waitUntil: "load" });
      await pg.waitForTimeout(1500);
      const shown = await pg.evaluate(() => [...document.querySelectorAll("section.view")].filter((s) => !s.hidden).map((s) => s.id).join(","));
      const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
      out.push(`${label} #${v}: ${shown} width=${wide}${wide > w ? " (SIDEWAYS SCROLL)" : ""}`);
    }
    await pg.goto(BASE + "#clubs", { waitUntil: "load" }); await pg.waitForTimeout(2000);
    const cr = await pg.textContent("#crOut");
    out.push(`${label} clubs: ${/нээгдэнэ|нээлттэй|хаагдсан/i.test(cr) ? "registration block ok" : "REGISTRATION BLOCK MISSING"}; rows=${await pg.locator("#crOut .crrow").count()}; volleyball name=${cr.includes("Гар бөмбөг")}`);
    await pg.click("#acctBar >> text=Нэвтрэх"); await pg.waitForTimeout(400);
    const note = await pg.textContent("#panel p.muted");
    out.push(`${label} login note: ${note.includes("Нэвтрэлгүйгээр үзнэ") && note.includes("Дасгалын сан") ? "ok" : "WRONG: " + note.slice(0, 120)}`);
    await ctx.close();
  }
  await b.close();
  console.log(out.join("\n"));
  console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "NO SCRIPT ERRORS");
  process.exit(errs.length ? 1 : 0);
})();
