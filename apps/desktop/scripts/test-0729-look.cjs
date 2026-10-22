// 0.7.29 / 0.7.30, asked by the Owner: the AI service status is only a dot (green / red); the logo is only the S, animated as
// designed in Figma; every interface heading rises and settles letter by letter (spring-text-engine); a Dot & Ring
// cursor; a voice orb (orbloom) while the microphone records; no companies' logos.
const fs = require("fs"), path = require("path");
function expect(v, m) { if (!v) throw new Error(m); }
const SRC = path.join(__dirname, "..", "renderer", "src");
const read = (f) => fs.readFileSync(path.join(SRC, f), "utf8");
const main = read("main.jsx"), css = read("styles.css"), pkg = require("../package.json");

expect(/className=\{cx\("statusDot",omni===true\?"ok":"bad"\)\} role="status" aria-label=\{label\}/.test(main) && !/<Wifi size=\{15\}\/>/.test(main), "the status is a dot with its text for screen readers");
expect(/\.statusDot\.ok\{background:var\(--success\)/.test(css) && /\.statusDot\{[^}]*background:var\(--danger\)/.test(css), "green when it answers, red when not");

expect(/src="\.\/serasmart-s\.webp"/.test(main) && !fs.existsSync(path.join(SRC, "..", "public", "serasmart-ai-mark.webp")) && fs.existsSync(path.join(SRC, "..", "public", "serasmart-s.webp")), "the logo is only the S, the picture with the name is gone");
// 0.7.30: the S turns (no glow), faster while the AI answers; next to an answer it spins like a spiral while writing.
expect(/@keyframes sTurn/.test(css) && !/@keyframes sGlow/.test(css) && /html\[data-thinking\] \.brandS img\{animation-duration:3s\}/.test(css), "the S turns, faster while thinking");
expect(/className=\{cx\("assistantMark logoMark",m\.streaming&&"spinning"\)\}/.test(main) && /@keyframes sSpiral/.test(css), "the S next to an answer spins while it is written");
expect(/prefers-reduced-motion:reduce\)\{\.brandS img,/.test(css) && /dataset\.thinking="1"/.test(main), "still with reduce motion; thinking follows the answers in progress");

// 0.7.30: the Owner removed the letter animation of the headings and the Dot & Ring cursor.
expect(!pkg.dependencies["spring-text-engine"] && !pkg.dependencies["@react-spring/web"] && !fs.existsSync(path.join(SRC, "riseText.jsx")) && !fs.existsSync(path.join(SRC, "cursor.js")), "no heading animation and no cursor ring");
expect(!/<Rise |startDotRingCursor/.test(main) && !/dotRing/.test(css), "nothing of them is left");
// 0.7.30: the left bar scrolls with a thin scrollbar in the theme's colours (it was a wide black strip).
expect(/::-webkit-scrollbar-thumb\{background:color-mix/.test(css) && /scrollbar-width:thin/.test(css) && /\.sideScroll\{overscroll-behavior:contain\}/.test(css), "thin themed scrollbars");
// 0.7.30: connectors, plugins and skills are one «Extensions» page.
expect(/\["extensions",Puzzle,"Extensions",null\]/.test(main) && !/\["plugins",Plug,"Apps"/.test(main) && !/\["skills",Sparkles,"Skills"/.test(main), "one Extensions entry in the tools menu");
const ext = read("pages/Extensions.jsx");
expect(/\["connectors", Plug, "Connectors"/.test(ext) && /\["plugins", Puzzle, "Plugins"/.test(ext) && /\["skills", Sparkles, "Skills"/.test(ext) && /<ConnectorsPanel \/>/.test(ext) && /<PluginsPanel \/>/.test(ext) && /<SkillsPanel \/>/.test(ext), "Extensions opens connectors, plugins and skills");

expect(pkg.dependencies.orbloom === "0.1.0", "orbloom pinned");
const orb = read("voiceOrb.jsx");
expect(/preset: "core-teal-01"/.test(orb) && /base: "#07262b"/.test(orb) && /quality: "balanced"/.test(orb) && /reducedMotion: "user"/.test(orb) && /orb-no-webgl/.test(orb) && /role="status"/.test(orb), "the voice orb as specified, with a text state and a WebGL fallback");
expect(/React\.lazy\(\(\)=>import\("\.\/voiceOrb\.jsx"\)\)/.test(main) && /\(recording\|\|transcribing\)&&<Suspense/.test(main), "loaded only when the microphone is used");

// 0.7.30: the apps' own logos, carried with the app (no request to another site), letters when there is none;
// the status dot shows no text at all, not even on hover.
expect(!/simpleicons\.org/.test(read("pages/Plugins.jsx") + read("pages/Connectors.jsx")), "the logos come with the app");
const icons = fs.readdirSync(path.join(SRC, "..", "public", "brands"));
const { CATALOG } = require("../lib/connectors.cjs");
for (const e of CATALOG.filter((x) => x.logo)) expect(icons.includes(e.logo + ".svg"), "a logo for " + e.name);
expect(JSON.stringify(JSON.parse(read("brands.js").match(/new Set\((\[[^\]]*\])\)/)[1]).sort()) === JSON.stringify(icons.map((f) => f.replace(/\.svg$/, "")).sort()), "brands.js lists exactly the logos carried");
expect(/<AppLogo logo=\{run\.logo\}/.test(read("pages/Connectors.jsx")) && /onError=\{\(\) => setFailed\(true\)\}/.test(read("pages/Connectors.jsx")), "logos in the approval cards, letters if one fails");
expect(!/statusDot[^\n]*title=/.test(main), "no tooltip on the status dot");
console.log("0.7.29 look OK");
