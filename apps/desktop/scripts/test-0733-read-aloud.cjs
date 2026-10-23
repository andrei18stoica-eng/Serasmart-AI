// 0.7.33, asked by the Owner: "Read aloud" speaks in the answer's own language (it always used one language before),
// and the Download (PDF / Word / PowerPoint) button under each answer is gone.
const fs = require("fs"), path = require("path");
function expect(v, m) { if (!v) throw new Error(m); }
(async () => {
  const { detectSpeechLang, voiceFor, speakableText } = await import("../renderer/src/speechLang.mjs");
  const cases = [
    ["Bună! Cu ce te pot ajuta?", "ro-RO"], ["Buna ziua, as vrea sa stiu pretul pentru acest serviciu", "ro-RO"],
    ["Hello! How can I help you today?", "en-US"], ["¿Hola, cómo estás? Esto es para ti.", "es-ES"],
    ["Bonjour, comment allez-vous ? C’est très bien pour les enfants.", "fr-FR"], ["Guten Tag, das ist nicht gut und ich bin müde.", "de-DE"],
    ["Ciao, che cosa fai? Questo è molto bello.", "it-IT"], ["Привет, как дела? Это для тебя.", "ru-RU"], ["你好，今天怎么样？", "zh-CN"]
  ];
  for (const [text, lang] of cases) expect(detectSpeechLang(text) === lang, `${text} → ${detectSpeechLang(text)}, expected ${lang}`);
  const voices = [{ lang: "en-US", name: "A" }, { lang: "ro-RO", name: "B" }, { lang: "fr-CA", name: "C" }];
  expect(voiceFor("ro-RO", voices).name === "B" && voiceFor("fr-FR", voices).name === "C" && voiceFor("de-DE", voices) === null, "the right installed voice");
  const spoken = speakableText("## Titlu\n- **punct** cu [link](https://x.ro)\n```js\ncode()\n```\nFinal $x^2$");
  expect(!/[#*`$]|https?:/.test(spoken) && /Titlu/.test(spoken) && /link/.test(spoken) && !/code\(\)/.test(spoken), "Markdown, code and links are not read out: " + spoken);
  const main = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "main.jsx"), "utf8");
  const actions = main.slice(main.indexOf("function MessageActions("), main.indexOf("function MessageActions(") + 2500);
  expect(!/exportWrap|exportMenu|<Download/.test(actions) && /detectSpeechLang\(/.test(actions) && /u\.voice=voice/.test(actions), "no Download button under answers; read aloud picks the language and voice");
  console.log("test-0733-read-aloud: ok");
})().catch((e) => { console.error(e); process.exit(1); });
