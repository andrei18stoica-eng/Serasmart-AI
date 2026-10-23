// 0.7.36, asked by the Owner: "when I type there is lag; I want it gone". The typed text lives in a small store read
// only by the message box (draftStore / useDraft), so a key press no longer re-renders the whole app (conversation
// with all its messages, sidebar, header).
const fs = require("fs"), path = require("path");
function expect(v, m) { if (!v) throw new Error(m); }
const main = fs.readFileSync(path.join(__dirname, "../renderer/src/main.jsx"), "utf8");
const app = main.slice(main.indexOf("function App("));
expect(/const draftStore=\(\(\)=>\{/.test(main) && /function useDraft\(\)\{return \[useSyncExternalStore\(draftStore\.subscribe/.test(main), "the draft has its own store");
expect(/function Composer\(\{centered,onSend,/.test(main) && /const \[draft,setDraft\]=useDraft\(\);/.test(main), "only the message box subscribes to it");
expect(!/\[draft,setDraft\]=useState/.test(app) && !/draft=\{draft\}/.test(app), "App does not keep the draft in its state");
expect(/const draft=draftStore\.get\(\),text=answer/.test(app), "sending reads the text at that moment");
// Also 0.7.36: a file's name and its title come from the request, never from the chat's name.
(async () => {
  const { pathToFileURL } = require("url");
  const intent = await import(pathToFileURL(path.join(__dirname, "../renderer/src/documentIntent.mjs")).href);
  const t = intent.fileTitleFor;
  expect(t("vreau un pdf numit „Oferta 2026”", "# Altceva", "") === "Oferta 2026", "a name the person gave wins");
  expect(t("x", "y", "Regnul_Animal.pptx") === "Regnul_Animal", "then the file line of the answer");
  expect(t("Fă-mi o prezentare despre regnul animal", "## Regnul animal\nx", "") === "Regnul animal" && t("fa o prezentare", "SLIDE 1 — Energia solară\nx", "") === "Energia solară", "then the file's own first title");
  expect(t("fă un excel cu bugetul pe luna mai", "| a |", "") === "Bugetul pe luna mai" && t("Fă-mi un document Word cu un CV", "", "") === "CV", "then the subject of the request");
  expect(/title:safeFileTitle\(fileTitleFor\(messageText\(lastUser\),content,madeName\)\|\|tr\("Document"\)\)/.test(main) && !/working\.title\|\|`\$\{BRAND_NAME\} - /.test(main), "the chat's name is not used for files");
  const { createExportBytes } = require("../lib/documents.cjs"), JSZip = require("jszip");
  const xml = await (await JSZip.loadAsync((await createExportBytes("docx", "Numele conversației", "# Fotosinteza\n\nText.")).bytes)).file("word/document.xml").async("string");
  expect(!/Numele conversației/.test(xml) && (xml.match(/Fotosinteza/g) || []).length === 1, "a file with its own # title shows it once, not the given title");
  const gw = fs.readFileSync(path.join(__dirname, "../local-gateway.cjs"), "utf8");
  expect(/free&&attempt===0\?\{free:true\}:null/.test(gw), "translations fall back to the normal route when free models cannot answer");
  expect(/never use the chat's name/.test(gw), "the AI is told to name the file after the request");
  console.log("test-0736-typing: ok");
})().catch((e) => { console.error(e); process.exit(1); });
