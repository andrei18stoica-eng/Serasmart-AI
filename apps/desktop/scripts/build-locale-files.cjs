// 0.7.37, asked by the Owner: every interface text in all 24 languages, carried by the app (no waiting for the server).
// Translations are written as i18n-src/<lang>.txt (or in parts, <lang>-1.txt, <lang>-2.txt …), one «N|text» line per text, N = the line of the text in
// lib/i18n-keys.json (1-based). This script checks them ({placeholders} kept, nothing missing) and writes
// renderer/src/i18n/<lang>.json, which the app loads only for the chosen language.
// Run: node scripts/build-locale-files.cjs        (test-0737-locales.cjs checks the output is up to date)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const keys = JSON.parse(fs.readFileSync(path.join(root, "lib/i18n-keys.json"), "utf8"));
const ph = (t) => (String(t).match(/\{\w+\}/g) || []).sort().join();
function build(lang) {
  const dir = path.join(root, "i18n-src");
  const files = fs.readdirSync(dir).filter((f) => new RegExp(`^${lang}(?:-\\d+)?\\.txt$`).test(f)).sort();
  const out = {}, problems = [];
  for (const line of files.flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/))) {
    const m = line.match(/^(\d+)\|(.*)$/); if (!m) continue;
    const key = keys[Number(m[1]) - 1], value = m[2].trim();
    if (!key) { problems.push(`line ${m[1]}: no such text`); continue; }
    if (!value) { problems.push(`${m[1]}: empty`); continue; }
    if (ph(value) !== ph(key)) { problems.push(`${m[1]}: placeholders ${ph(key)} ≠ ${ph(value)}`); continue; }
    out[key] = value;
  }
  const missing = keys.filter((k) => !(k in out));
  return { out, problems, missing };
}
function langs() { try { return fs.readdirSync(path.join(root, "i18n-src")).filter((f) => /^[a-z]{2}(?:-\d+)?\.txt$/.test(f)).map((f) => f.slice(0, 2)).filter((l, i, a) => a.indexOf(l) === i).sort(); } catch { return []; } }
module.exports = { build, langs, keys };
if (require.main === module) {
  fs.mkdirSync(path.join(root, "renderer/src/i18n"), { recursive: true });
  let bad = 0;
  for (const lang of langs()) {
    const { out, problems, missing } = build(lang);
    fs.writeFileSync(path.join(root, "renderer/src/i18n", lang + ".json"), JSON.stringify(out) + "\n");
    console.log(`${lang}: ${Object.keys(out).length}/${keys.length}${missing.length ? `, missing ${missing.length}` : ""}${problems.length ? `, problems ${problems.length}: ${problems.slice(0, 5).join("; ")}` : ""}`);
    if (problems.length) bad++;
  }
  process.exitCode = bad ? 1 : 0;
}
