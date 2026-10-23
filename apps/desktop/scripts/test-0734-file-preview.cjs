// 0.7.34, asked by the Owner: "I want to look inside the file before downloading it". Word, PowerPoint and Excel are
// read on the server into pages / slides / sheets (lib/officepreview.cjs) and the app shows them; nothing is downloaded
// on its own any more.
const fs = require("fs"), path = require("path");
const { createExportBytes } = require("../lib/documents.cjs");
const { officePreview, officeKind } = require("../lib/officepreview.cjs");
function expect(v, m) { if (!v) throw new Error(m); }
(async () => {
  expect(officeKind("a.docx") === "docx" && officeKind("a.PPTX") === "pptx" && officeKind("x", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") === "xlsx" && officeKind("a.pdf") === "", "office kinds");
  const doc = await officePreview((await createExportBytes("docx", "Raport", "# Raport\n\n## Introducere\nUn **test**.\n\n- unu\n- doi\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nFinal")).bytes, "r.docx");
  const t = doc.blocks.map((b) => b.t).join(",");
  expect(doc.kind === "docx" && t.includes("h") && t.includes("li,li") && t.includes("table") && doc.blocks.find((b) => b.t === "table").rows[1].join() === "1,2", "Word: headings, lists, tables in order: " + t);
  expect(doc.blocks.some((b) => b.runs?.some((r) => r.b && r.text === "test")), "Word keeps bold text");
  const deck = await officePreview((await createExportBytes("pptx", "Pitch", "## Primul slide\n- idee unu\n- idee doi\n\n## Prețuri\n| Plan | Lei |\n|---|---|\n| Pro | 99 |")).bytes, "p.pptx");
  expect(deck.kind === "pptx" && deck.slides.some((s) => s.title === "Primul slide" && s.lines.some((l) => l.text === "idee unu")) && deck.slides.some((s) => s.tables.length && s.tables[0][1].join() === "Pro,99"), "PowerPoint: slides with titles, bullets and tables");
  const book = await officePreview((await createExportBytes("xlsx", "Buget", "## Date\n| Item | Lei |\n|---|---|\n| A | 10 |\n| B | 20,5 |\n| Total | =SUM(B2:B3) |\n| TVA | =ROUND(B4*0.21,2) |\n| Text | =IF(B4>30,\"mult\",\"puțin\") |\n\n## Sumar\n| X | Y |\n|---|---|\n| T | =Date!B4*2 |\n| Nu | =FOO(1) |")).bytes, "b.xlsx");
  const [data, sum] = book.sheets;
  expect(book.kind === "xlsx" && data.name === "Date" && data.rows[3][1].v === 30.5 && data.rows[3][1].f === "=SUM(B2:B3)" && data.rows[4][1].v === 6.41 && data.rows[5][1].v === "mult", "Excel: formulas worked out for the preview");
  expect(sum.rows[1][1].v === 61 && sum.rows[2][1].e === true, "Excel: other sheets referenced; unknown functions shown as formulas");
  let refused = false; try { await officePreview(Buffer.from("not a zip"), "x.docx"); } catch { refused = true; }
  expect(refused, "a broken file is refused, not crashing");
  const main = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "main.jsx"), "utf8"), viewer = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "viewer.jsx"), "utf8");
  expect(!/downloadGeneratedFile\(exported\.data\)/.test(main), "a made file is not downloaded on its own");
  expect(/onClick=\{openable\?\(\)=>setViewing\(true\)/.test(main) && /\/api\/library\/\$\{id\}\/office/.test(viewer) && /function XlsxView/.test(viewer) && /function PptxView/.test(viewer), "the file card opens the file inside the app");
  const gw = fs.readFileSync(path.join(__dirname, "..", "local-gateway.cjs"), "utf8");
  expect(/app\.get\("\/api\/library\/:id\/office", auth/.test(gw), "the office preview route needs an account");
  console.log("test-0734-file-preview: ok");
})().catch((e) => { console.error(e); process.exit(1); });
