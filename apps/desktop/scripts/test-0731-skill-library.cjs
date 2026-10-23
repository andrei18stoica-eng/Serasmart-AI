// 0.7.31, asked by the Owner: plugins that hold several skills, and single skills, taken from open-source repositories
// whose licences allow publishing them. Anthropic's docx / pdf / pptx / xlsx skills are "All rights reserved" and must
// never be in the library; every pack carries its author and an MIT / Apache 2.0 licence, with the licence texts beside it.
const fs = require("fs"), http = require("http"), os = require("os"), path = require("path");
const { startLocalGateway } = require("../local-gateway.cjs");
const { library, libraryIndex, resolveSkills, skillsForMessage, skillSystemText, MAX_INSTRUCTIONS } = require("../lib/skills.cjs");

function expect(v, m) { if (!v) throw new Error(m); }
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));

function units() {
  const lib = library(), dir = path.join(__dirname, "..", "lib", "skill-library");
  expect(lib.packs.length >= 40, "the library has the packs: " + lib.packs.length);
  const all = lib.packs.flatMap(p => p.skills);
  expect(all.length >= 300, "the library has the skills: " + all.length);
  for (const p of lib.packs) {
    // Serasmart's own plugin is the only one not taken from an open-source repository.
    if (p.source === "serasmart") { expect(/^serasmart-/.test(p.id) && p.author === "Serasmart AI" && p.skills.every((sk) => /Serasmart AI/.test(sk.instructions)), "Serasmart's own pack: " + p.id); continue; }
    expect(/^(MIT|Apache-2\.0)$/.test(p.license) && p.author && p.skills.length, `pack ${p.id} has an author and an open licence`);
    const src = lib.sources.find(s => s.id === p.source);
    expect(src && /^https:\/\/github\.com\//.test(src.repo) && fs.existsSync(path.join(dir, "licenses", src.licenseFile)), `pack ${p.id} names its source and licence text`);
  }
  const anthropic = lib.packs.find(p => p.id === "anthropic").skills.map(s => s.slug);
  for (const banned of ["docx", "pdf", "pptx", "xlsx", "doc-coauthoring"]) expect(!anthropic.includes(banned), `Anthropic's ${banned} is not in the library`);
  expect(!all.some(s => /all rights reserved|proprietary\. license\.txt/i.test(s.instructions)), "no proprietary skill text");
  // 0.7.32 legal review: no Anthropic brand skill, no pack named after Anthropic, no Composio skills (no LICENSE file),
  // no packs tied to another company's service, nothing about defeating software protection, no non-commercial-only models.
  expect(!anthropic.includes("brand-guidelines") && !lib.packs.some(p => /anthropic|claude/i.test(p.name)), "no Anthropic branding");
  expect(!lib.packs.some(p => p.source === "composio") && !lib.sources.some(s => s.id === "composio"), "Composio left out");
  const slugs = new Set(all.map(s => s.slug));
  // 0.7.33: Anthropic's knowledge-work and financial-services plugins (Apache 2.0), without the partner-built ones;
  // Serasmart Documents with its four skills, written for Serasmart (not taken from Anthropic's docx/pptx/xlsx/pdf).
  expect(["kw-sales", "kw-legal", "kw-small-business", "fin-financial-analysis"].every(id => lib.packs.some(p => p.id === id)), "Anthropic business and finance plugins are in");
  expect(!lib.packs.some(p => /zoom|apollo|slack|common-room|brand-voice|lseg|spglobal|cowork|pdf-viewer/.test(p.id)), "partner-built and Cowork-only plugins left out");
  const docs = lib.packs.find(p => p.id === "serasmart-documents");
  expect(docs && docs.skills.map(s => s.slug).join() === "word,powerpoint,excel,pdf" && docs.skills.every(s => /Serasmart AI/.test(s.instructions)), "Serasmart Documents has its four skills");
  // 0.7.34: a Serasmart pack for each kind of plugin that could not be taken (no licence, a company's own service, Cowork-only).
  const own = lib.packs.filter(p => p.source === "serasmart").map(p => p.id);
  expect(["serasmart-writing", "serasmart-business", "serasmart-meetings", "serasmart-social", "serasmart-dev", "serasmart-science", "serasmart-builder"].every(id => own.includes(id)) && lib.packs.slice(0, own.length).every(p => p.source === "serasmart"), "Serasmart's own packs come first: " + own);
  for (const out of ["anti-reversing-techniques", "alphagenome", "timesfm-forecasting"]) expect(!slugs.has(out), out + " left out");
  for (const out of ["social-publishing", "hermes-tweet", "protect-mcp", "signed-audit-trails", "review-agent-governance"]) expect(!lib.packs.some(p => p.id === "wsh-" + out), out + " left out");
  expect(["frontend-design", "canvas-design", "internal-comms", "theme-factory", "mcp-builder"].every(s => anthropic.includes(s)), "Anthropic's Apache 2.0 skills are in");
  expect(new Set(all.map(s => s.slug)).size === all.length && all.every(s => /^[a-z0-9-]{1,32}$/.test(s.slug)), "slugs are unique and fit /commands");
  expect(all.every(s => s.instructions.length <= MAX_INSTRUCTIONS && !/^---\n(name|description):/.test(s.instructions)), "instructions fit and have no front matter");
  expect(fs.readFileSync(path.join(dir, "NOTICE.md"), "utf8").includes("Left out on purpose"), "NOTICE lists what was left out");
  expect(JSON.stringify(libraryIndex()).length < 400000 && !JSON.stringify(libraryIndex()).includes('"instructions"'), "the index stays light");

  // A pack makes all its skills callable; the account's own skill with the same slug wins.
  const items = [{ kind: "pack", pack: "superpowers", enabled: true }, { slug: "systematic-debugging", name: "Mine", instructions: "MINE", enabled: true }];
  const used = skillsForMessage(items, "/brainstorming /systematic-debugging");
  expect(used.length === 2 && used.find(s => s.slug === "systematic-debugging").instructions === "MINE", "own skill wins over the pack's");
  const text = skillSystemText(used);
  expect(/Superpowers/.test(text) && /Jesse Vincent/.test(text) && /MIT/.test(text) && /nu sunt disponibile/.test(text), "the system text names the source and the missing files");
  expect(resolveSkills([{ kind: "pack", pack: "superpowers", enabled: false }]).length === 0, "a turned-off pack adds nothing");
}

async function gateway() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serasmart-skilllib-"));
  const systems = [];
  const omni = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => body += c); req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "Ai principal", owned_by: "combo" }] }));
      if (req.url === "/v1/chat/completions") {
        const j = JSON.parse(body); systems.push(String(j.messages.find(m => m.role === "system")?.content || ""));
        return res.end(JSON.stringify({ id: "x", model: j.model, choices: [{ index: 0, message: { role: "assistant", content: "Gata." }, finish_reason: "stop" }] }));
      }
      res.statusCode = 404; res.end("{}");
    });
  });
  const omniPort = await listen(omni);
  const cfg = { baseUrl: `http://127.0.0.1:${omniPort}/v1`, apiKey: "sk-omni", model: "Ai principal", webSearchEnabled: false, githubAutoContext: false, ownerEmail: "owner@example.com" };
  const gw = startLocalGateway({ dataDir: dir, port: 8884, host: "127.0.0.1", getOmniConfig: () => cfg });
  const base = "http://127.0.0.1:8884";
  const call = async (p, { method = "GET", body, token } = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const token = (await call("/auth/register", { method: "POST", body: { email: "owner@example.com", password: "password123", name: "Owner" } })).j.token;
    const chat = (text) => call("/api/chat", { method: "POST", token, body: { model: "Ai principal", messages: [{ role: "user", content: text }] } });
    let r = await call("/api/skills/library", { token });
    expect(r.status === 200 && r.j.packs.length >= 40 && r.j.added.packs.length === 0, "library listed");
    r = await call("/api/skills/library", { method: "POST", token, body: { pack: "superpowers" } });
    expect(r.status === 200 && r.j.data.kind === "pack" && r.j.data.skills.length === 15 && r.j.data.license === "MIT", "a pack is added: " + JSON.stringify(r.j).slice(0, 200));
    const packId = r.j.data.id;
    expect((await call("/api/skills/library", { method: "POST", token, body: { pack: "superpowers" } })).status === 409, "the same pack twice is refused");
    expect((await call("/api/skills/library", { method: "POST", token, body: { pack: "nope" } })).status === 404, "an unknown pack is refused");
    r = await call("/api/skills/library", { method: "POST", token, body: { skill: "frontend-design" } });
    expect(r.status === 200 && r.j.data.library === "frontend-design" && r.j.data.source.license === "Apache-2.0" && r.j.data.instructions.length > 1000, "a single skill is added with its source");
    r = await call("/api/skills", { token });
    expect(r.j.data.length === 1 && r.j.packs.length === 1, "skills and packs are listed apart");
    await chat("/test-driven-development scrie o funcție");
    expect(/### \/test-driven-development/.test(systems.at(-1)) && /Jesse Vincent/.test(systems.at(-1)), "a pack's skill reaches the model");
    await chat("/frontend-design o pagină");
    expect(/### \/frontend-design/.test(systems.at(-1)) && /Anthropic/.test(systems.at(-1)), "a single library skill reaches the model");
    // 0.7.33: a file answer gets Serasmart Documents' guidance for its format, without adding anything.
    await call("/api/chat", { method: "POST", token, body: { model: "Ai principal", fileFormat: "xlsx", messages: [{ role: "user", content: "un excel cu bugetul" }] } });
    expect(/SERASMART DOCUMENTS/.test(systems.at(-1)) && /=SUM\(B2:B10\)/.test(systems.at(-1)), "the Excel guidance reaches the model");
    r = await call("/api/skills/library/notice", { token });
    expect(r.status === 200 && /Left out on purpose/.test(r.j.notice) && r.j.licenses.some(l => /Apache License/.test(l.text)) && r.j.licenses.some(l => /MIT License/.test(l.text)), "the licence texts are shown");
    expect((await call(`/api/skills/${packId}`, { method: "DELETE", token })).status === 200, "a pack is removed");
    await chat("/test-driven-development scrie o funcție");
    expect(!/### \/test-driven-development/.test(systems.at(-1)), "a removed pack's skills stop");
  } finally {
    await gw.close(); omni.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function formulas() {
  const JSZip = require("jszip");
  const { createExportBytes, formulaOf } = require("../lib/documents.cjs");
  expect(formulaOf("=SUM(B2:B4)") === "SUM(B2:B4)" && formulaOf('=WEBSERVICE("http://x")') === null && formulaOf("=cmd|' /c calc'!A0") === null && formulaOf("= 5") === null, "safe formulas only");
  const out = await createExportBytes("xlsx", "Buget", "| Item | Lei |\n|---|---|\n| A | 10 |\n| B | 20 |\n| Total | =SUM(B2:B3) |\n| Web | =WEBSERVICE(\"http://x\") |");
  const zip = await JSZip.loadAsync(out.bytes || out.buffer || out);
  const sheet = await zip.file("xl/worksheets/sheet1.xml").async("string"), book = await zip.file("xl/workbook.xml").async("string");
  expect(/<f>SUM\(B2:B3\)<\/f>/.test(sheet) && !/<f>WEBSERVICE/.test(sheet) && /fullCalcOnLoad="1"/.test(book), "an Excel formula stays live and is worked out on opening");
}

(async () => { units(); await formulas(); await gateway(); console.log("test-0731-skill-library: ok"); })().catch((e) => { console.error(e); process.exit(1); });
