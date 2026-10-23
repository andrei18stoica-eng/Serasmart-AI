// 0.7.35, asked by the Owner: a deck asked for in chat comes back as the .pptx itself (not as text describing it), in
// the colours and font the person asked for, with speaker notes and sources; it can be changed by asking again
// ("poți să editezi pptx-ul…"); every account can have the whole app translated from the language button; the
// router behind the AI is never named to other accounts; skills have no fixed cap; settings like Claude's.
const fs = require("fs"), path = require("path"), JSZip = require("jszip");
const { createExportBytes, pptxSource } = require("../lib/documents.cjs");
const { validateAccountSettings } = require("../lib/accountsettings.cjs");
const { MAX_SKILLS } = require("../lib/skills.cjs");
function expect(v, m) { if (!v) throw new Error(m); }
const deck = [
  "REGNUL ANIMAL", "Fișier: Regnul_Animal.pptx", "",
  "SLIDE 1 — REGNUL ANIMAL", "Diversitate și clasificare", "Disciplina: Biologie", "", "Note prezentator:", "Introducerea temei.", "",
  "SLIDE 2 — CE ESTE UN ANIMAL?", "Organism eucariot.", "Nutriție heterotrofă.", "Sursă: OpenStax, 2020.", "", "Note prezentator:", "Despre caractere.", "",
  "SLIDE 3 — ORGANIZARE", "De la celulă la organism", "Nivel\tExemplu", "Celulă\tneuron", "Organ\tinimă", "Sursă: OpenStax, 2020.", "",
  "FORMATARE PPTX", "Fundal principal: #FCFAF3.", "Accente: #AA9162.", "Titluri: #29343A.", "Text: #525B61.", "Font exclusiv: Times New Roman."
].join("\n");
(async () => {
  const src = pptxSource(deck);
  expect(src.sections.length === 3 && src.sections[0].number === 1 && src.sections[1].notes.join() === "Despre caractere." && src.sections[1].source[0] === "OpenStax, 2020.", "slides, notes and sources are read");
  expect(src.style.bg === "FCFAF3" && src.style.accent === "AA9162" && src.style.title === "29343A" && src.style.font === "Times New Roman", "the formatting section styles the deck");
  const zip = await JSZip.loadAsync((await createExportBytes("pptx", "Regnul animal", deck)).bytes);
  const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  expect(slides.length === 3, `one slide per «SLIDE n» (cover included), got ${slides.length}`);
  const all = (await Promise.all(slides.map((f) => zip.file(f).async("string")))).join("");
  expect(/FCFAF3/.test(all) && /Times New Roman/.test(all) && /01 \/ 03/.test(all) && /Celulă/.test(all) && !/FORMATARE/.test(all), "colours, font, numbering and the table are on the slides; the formatting section is not");
  const notes = Object.keys(zip.files).filter((f) => /notesSlide\d+\.xml$/.test(f));
  const notesText = (await Promise.all(notes.map((f) => zip.file(f).async("string")))).join("");
  expect(/Despre caractere/.test(notesText), "speaker notes go into the notes");
  const intent = await import(path.join(__dirname, "../renderer/src/documentIntent.mjs"));
  expect(intent.answerFileFormat(deck)?.format === "pptx" && intent.answerFileFormat(deck).name === "Regnul_Animal.pptx", "an answer that is a deck becomes the .pptx");
  expect(intent.answerFileFormat("SLIDE 1 — A\nx\nSLIDE 2 — B\ny\nSLIDE 3 — C\nz")?.format === "pptx" && !intent.answerFileFormat("Salut! Iată ideile mele."), "slide by slide answers are decks; normal answers are not");
  for (const t of ["poti sa editezi pptx-ul si sa pui sigla jos", "îmi modifici slide-ul 3?", "adaugi un slide cu concluzii"]) expect(intent.editedDocumentFormat(t.replace("?", ""), [], "pptx") === "pptx", "an edit asked in the second person changes the file: " + t);
  const main = fs.readFileSync(path.join(__dirname, "../renderer/src/main.jsx"), "utf8");
  expect(/answerFileFormat\(answer\)/.test(main) && /madeName\?\{fileName:/.test(main), "the chat makes the file from such an answer, with its name");
  expect(MAX_SKILLS === null, "skills have no fixed cap any more");
  expect(validateAccountSettings({ avatar: "data:image/webp;base64,AAAA" }).value?.avatar && validateAccountSettings({ avatar: "javascript:alert(1)" }).error && validateAccountSettings({ avatar: "" }).value.avatar === "", "the profile photo is a small picture or nothing");
  const gw = fs.readFileSync(path.join(__dirname, "../local-gateway.cjs"), "utf8");
  expect(/app\.post\("\/api\/i18n\/:lang\/prepare",auth,/.test(gw) && /I18N_PARALLEL=3/.test(gw) && /progress:i18nProgress/.test(gw), "any account starts the translation of its language; three at a time; progress is sent");
  expect(/function hideRouterName\(req,res\)\{\s*if\(ownerRequest\(req\)/.test(gw) && /hideRouterName\(req,res\)/.test(gw.slice(gw.indexOf("function auth(req,res,next)"))), "the router's name is hidden from other accounts");
  expect(!/tr\("OmniRoute combination"\)|"Other OmniRoute models"|OmniRoute sent the question/.test(main), "the model list and route badge do not name the router");
  const i18n = fs.readFileSync(path.join(__dirname, "../renderer/src/i18n.jsx"), "utf8");
  expect(/\/api\/i18n\/\$\{lang\}\/prepare/.test(i18n) && /languageProgress/.test(main), "the language button starts it and shows the progress");
  const acc = fs.readFileSync(path.join(__dirname, "../renderer/src/pages/AccountSettings.jsx"), "utf8");
  expect(/Log out of all devices/.test(acc) && /Account ID/.test(acc) && /Last active/.test(acc) && /What best describes your work\?/.test(acc) && /squarePhoto/.test(acc), "settings: photo, work, account ID, sign out everywhere, sessions");
  console.log("test-0735-files-settings: ok");
})().catch((e) => { console.error(e); process.exit(1); });
