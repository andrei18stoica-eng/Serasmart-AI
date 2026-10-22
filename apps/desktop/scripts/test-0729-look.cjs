// 0.7.29, asked by the Owner: the AI service status is only a dot (green / red); the logo is only the S, animated as
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
expect(/@keyframes sGlow/.test(css) && /@keyframes sSweep/.test(css) && /html\[data-thinking\] \.brandS\{animation:sThink 1\.6s/.test(css), "the S glows and sweeps at rest and pulses while the AI answers");
expect(/prefers-reduced-motion:reduce\)\{\.brandS,/.test(css) && /dataset\.thinking="1"/.test(main), "still with reduce motion; thinking follows the answers in progress");

expect(pkg.dependencies["spring-text-engine"] === "0.1.5" && pkg.dependencies["@react-spring/web"], "spring-text-engine pinned");
const rise = read("riseText.jsx");
expect(/letterOut=\{\{ opacity: 0, y: 24 \}\} letterIn=\{\{ opacity: 1, y: 0 \}\}/.test(rise) && /letterConfig=\{\{ tension: 220, friction: 22 \}\} letterStagger=\{30\}/.test(rise) && /mode="once" overflow/.test(rise) && !/mode="manual"/.test(rise), "Rise & Settle exactly as specified");
expect(/justifyContent: justify/.test(rise) && /prefers-reduced-motion: reduce/.test(rise), "centred with justify-content; plain with reduce motion");
const files = ["main.jsx", "core.jsx", "accessRequest.jsx", "serverUpdate.jsx", ...fs.readdirSync(path.join(SRC, "pages")).map((f) => "pages/" + f)];
let plain = 0;
for (const f of files) plain += (read(f).match(/<h[1-6](?: [^>]*)?>[^<]{0,160}<\/h[1-6]>/g) || []).filter((h) => !/a întâmpinat o problemă/.test(h)).length;
expect(plain === 0, `every interface heading rises (${plain} left plain)`);

const cursor = read("cursor.js");
expect(/FOLLOW = 0\.14, RING = 36, DOT = 6, HOVER_SCALE = 1\.9, COLOUR = "#FFFFFF", SCALE_LERP = 0\.22/.test(cursor) && /closest\("a, button, input"\)/.test(cursor), "Dot & Ring with the given parameters");
expect(/\(hover: hover\) and \(pointer: fine\)/.test(cursor) && /prefers-reduced-motion: reduce/.test(cursor) && /aria-hidden", "true"/.test(cursor) && /pointerEvents: "none"/.test(cursor), "only with a fine pointer, never with reduce motion, never in the way");
expect(!/cursor:\s*none/.test(css) && !/cursor = "none"/.test(cursor), "the system cursor stays");

expect(pkg.dependencies.orbloom === "0.1.0", "orbloom pinned");
const orb = read("voiceOrb.jsx");
expect(/preset: "core-teal-01"/.test(orb) && /base: "#07262b"/.test(orb) && /quality: "balanced"/.test(orb) && /reducedMotion: "user"/.test(orb) && /orb-no-webgl/.test(orb) && /role="status"/.test(orb), "the voice orb as specified, with a text state and a WebGL fallback");
expect(/React\.lazy\(\(\)=>import\("\.\/voiceOrb\.jsx"\)\)/.test(main) && /\(recording\|\|transcribing\)&&<Suspense/.test(main), "loaded only when the microphone is used");

expect(!/simpleicons|<img src=\{src\}/.test(read("pages/Plugins.jsx")), "no companies' logos in Apps");
console.log("0.7.29 look OK");
