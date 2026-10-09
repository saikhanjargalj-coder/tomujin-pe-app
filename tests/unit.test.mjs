// Run: node tests/unit.test.mjs   (no npm packages needed)
// Loads assets/app.js with the CDN import stubbed, then tests the pure helpers.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "assets/app.js"), "utf8")
  .replace(/^import \{ createClient \} from .*$/m, "const createClient = () => { throw new Error('not in tests'); };");
globalThis.window = { TOMUJIN_CONFIG: { SCHOOL_DOMAIN: "tomujin.edu.mn" }, __TOMUJIN_TEST__: true };
globalThis.document = { getElementById: () => ({}), querySelector: () => null, querySelectorAll: () => [] };
const tmp = join(mkdtempSync(join(tmpdir(), "tpe-")), "app.mjs");
writeFileSync(tmp, src);
const m = await import(pathToFileURL(tmp).href);

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("esc escapes HTML", () => assert.equal(m.esc(`<img src=x onerror="a">&'`), "&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;"));
t("esc handles null", () => assert.equal(m.esc(null), ""));

t("coreScore weights sum to 100%", () => {
  const all100 = { attendance: 100, performance: 100, showcase: 100, attitude: 100, preparation: 100, load_awareness: 100 };
  assert.equal(m.coreScore(all100), 100);
});
t("coreScore matches database formula (83.0)", () =>
  assert.equal(m.coreScore({ attendance: 100, performance: 80, showcase: 90, attitude: 70, preparation: 100, load_awareness: 50, bonus: 5 }), 83));
t("coreScore ignores bonus and blanks", () => assert.equal(m.coreScore({ attendance: "", performance: 50, bonus: 10 }), 15));

t("improvement: more push-ups is better", () => assert.equal(m.improvement(20, 25, true), 5));
t("improvement: faster sprint is better", () => assert.equal(m.improvement(8.5, 8.0, false), 0.5));
t("improvement: slower sprint is worse", () => assert.ok(m.improvement(8.0, 8.4, false) < 0));
t("improvement: missing data -> null", () => { assert.equal(m.improvement(null, 5, true), null); assert.equal(m.improvement(5, undefined, true), null); });

t("parseRoster: tab-separated with header", () => {
  const { rows, errors } = m.parseRoster("first\tlast\temail\tcode\tgender\nAnu\tBat\tANU.B@tomujin.edu.mn\tS1\tF\nTemuulen\t\t\t\tm");
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { first_name: "Anu", last_name: "Bat", email: "anu.b@tomujin.edu.mn", student_code: "S1", gender: "F" });
  assert.equal(rows[1].email, null);
  assert.equal(rows[1].gender, "M");
});
t("parseRoster: rejects non-school email", () => {
  const { rows, errors } = m.parseRoster("Anu,Bat,anu@gmail.com");
  assert.equal(rows.length, 0); assert.equal(errors.length, 1);
});
t("parseRoster: rejects empty name", () => assert.equal(m.parseRoster(",Bat,anu@tomujin.edu.mn").errors.length, 1));

console.log(`\n${n} tests passed`);
