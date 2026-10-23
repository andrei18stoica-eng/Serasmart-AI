// 0.7.37: the interface comes translated with the app. Every renderer/src/i18n/<lang>.json is complete, up to date with
// i18n-src and keeps every {placeholder}; the languages without a file still use the server's translation.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..");
const keys = require(path.join(dir, "lib", "i18n-keys.json"));
const { build, langs } = require("./build-locale-files.cjs");
const holes = s => (String(s).match(/\{[a-zA-Z]+\}/g) || []).sort().join(",");

const shipped = langs();
assert.ok(shipped.length >= 4, "at least four languages ship with the app");
for (const lang of shipped) {
  const file = path.join(dir, "renderer", "src", "i18n", `${lang}.json`);
  assert.ok(fs.existsSync(file), `${lang}.json was built`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const fresh = build(lang);
  assert.deepStrictEqual(data, fresh.out, `${lang}.json matches i18n-src (run node scripts/build-locale-files.cjs)`);
  assert.equal(fresh.problems.length, 0, `${lang}: ${fresh.problems.slice(0, 3).join("; ")}`);
  assert.equal(Object.keys(data).length, keys.length, `${lang} has every text`);
  for (const k of keys) assert.equal(holes(data[k]), holes(k), `${lang}: placeholders of «${k}»`);
}
const i18n = fs.readFileSync(path.join(dir, "renderer", "src", "i18n.jsx"), "utf8");
assert.match(i18n, /import\.meta\.glob\("\.\/i18n\/\*\.json"/, "the language files load only when chosen");
assert.match(i18n, /bundled\[current\]\?\.\[text\]/, "a shipped translation is used before the server's");
console.log(`TEST_0737_LOCALES_PASSED (${shipped.join(", ")})`);
