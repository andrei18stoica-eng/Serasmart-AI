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
console.log("test-0736-typing: ok");
