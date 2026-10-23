// 0.7.34, asked by the Owner: "when I change the language the whole app should change, for every language the app
// has" and "no examples with names of cities, places, emails". Every text on screen goes through tr(); Romanian
// carries all of them; lib/i18n-keys.json lists them so the server can translate the whole app into each language
// ahead of time (POST /api/i18n/prefill, Owner only, free models, in the background).
const fs = require("fs"), path = require("path");
const { keys } = require("./build-i18n-keys.cjs");
function expect(v, m) { if (!v) throw new Error(m); }
const src = path.join(__dirname, "..", "renderer", "src");
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(jsx|mjs|js)$/.test(f) && f !== "locales.js") files.push(p); } })(src);
(async () => {
  const all = await keys();
  const listed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lib", "i18n-keys.json"), "utf8"));
  expect(JSON.stringify(listed) === JSON.stringify(all), "lib/i18n-keys.json is out of date: run node scripts/build-i18n-keys.cjs");
  const have = new Set(all), missing = [];
  for (const f of files) {
    const code = fs.readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    for (const m of code.matchAll(/\b(?:tr|T)\(\s*("(?:[^"\\\n]|\\.)*")/g)) { const k = JSON.parse(m[1]); if (!have.has(k)) missing.push(`${path.basename(f)}: ${k}`); }
  }
  expect(!missing.length, "texts with no Romanian translation:\n" + missing.join("\n"));
  // The pages the Owner named show no fixed Romanian any more (it would stay Romanian in every language).
  for (const name of ["pages/Design.jsx", "pages/Library.jsx", "pages/Memory.jsx", "pages/Scheduled.jsx", "pages/Code.jsx", "viewer.jsx"]) {
    const code = fs.readFileSync(path.join(src, name), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l));
    const ro = code.filter((l) => /"[^"]*[ăâîșțĂÂÎȘȚ][^"]*"|>[^<>{}]*[ăâîșțĂÂÎȘȚ][^<>{}]*</.test(l) && !/CATEGORY_(ORDER|LABELS)/.test(l));
    expect(!ro.length, `${name} still shows Romanian text:\n` + ro.join("\n").slice(0, 600));
  }
  const design = fs.readFileSync(path.join(src, "pages/Design.jsx"), "utf8");
  const examples = design.slice(design.indexOf("EXAMPLES"), design.indexOf("];", design.indexOf("EXAMPLES")));
  expect(!/@|\.(ro|com)\b|Bucureș|Cluj|Iași|Timișoara|Brașov|Constanța|Paris|London|Berlin/i.test(examples), "Design examples name no places or emails");
  const main = fs.readFileSync(path.join(src, "main.jsx"), "utf8");
  expect(!/Proiecte Primărie/.test(main), "neutral project example");
  const gw = fs.readFileSync(path.join(__dirname, "..", "local-gateway.cjs"), "utf8");
  const pre = gw.indexOf('app.post("/api/i18n/prefill"'), lang = gw.indexOf('app.post("/api/i18n/:lang"');
  expect(pre > 0 && pre < lang && gw.indexOf('app.get("/api/i18n/prefill"') < gw.indexOf('app.get("/api/i18n/:lang"'), "the prefill routes come before /api/i18n/:lang");
  expect(/app\.post\("\/api\/i18n\/prefill",auth,\(req,res\)=>\{\s*if\(!ownerRequest\(req\)\)return res\.status\(403\)/.test(gw), "only the Owner starts the prefill");
  expect(/i18nTranslate\(req,lang,todo,\{retries:2,free:true/.test(gw), "the prefill uses free models only and retries a failed batch");
  expect(/if\(ownerRequest\(req\)\)i18nPrefill\(req,\[lang\]\)/.test(gw), "opening a language as Owner translates the rest of the app into it");
  console.log("test-0734-i18n: ok");
})().catch((e) => { console.error(e.message || e); process.exit(1); });
