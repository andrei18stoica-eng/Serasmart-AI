// Looking inside Word, PowerPoint and Excel files without downloading them (0.7.34, asked by the Owner).
// The file is read on the server (JSZip, already used for making files) and sent to the app as plain data:
// Word → headings, paragraphs, lists and tables; PowerPoint → slides with title, lines and tables;
// Excel → sheets with their cells, formulas worked out for the preview. Nothing in the file is ever run.
"use strict";
const JSZip = require("jszip");

const LIMITS = { blocks: 3000, slides: 300, sheets: 30, rows: 500, cols: 40, cellChars: 500 };

function decode(s) {
  return String(s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ""; } })
    .replace(/&amp;/g, "&");
}
async function entry(zip, name) { const f = zip.file(name); return f ? f.async("string") : ""; }
function relTargets(xml, base) {
  const map = new Map();
  for (const m of String(xml || "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/\bId="([^"]+)"/) || [])[1], target = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
    if (!id || !target) continue;
    const parts = (target.startsWith("/") ? target.slice(1) : base + target).split("/"), out = [];
    for (const p of parts) { if (p === "..") out.pop(); else if (p && p !== ".") out.push(p); }
    map.set(id, out.join("/"));
  }
  return map;
}

// ---------- Word ----------
function wordRuns(pXml) {
  const runs = [];
  for (const m of pXml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>|<m:t(?:\s[^>]*)?>([\s\S]*?)<\/m:t>/g)) {
    if (m[2] != null) { runs.push({ text: decode(m[2]), i: true }); continue; }
    const r = m[1], props = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [""])[0];
    let text = "";
    for (const t of r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) text += t[1] != null ? decode(t[1]) : t[0].startsWith("<w:tab") ? "\t" : "\n";
    if (!text) continue;
    const on = (tag) => new RegExp(`<w:${tag}(?:\\s+w:val="(?!0|false)[^"]*")?\\s*/>`).test(props);
    runs.push({ text, ...(on("b") ? { b: true } : {}), ...(on("i") ? { i: true } : {}) });
  }
  return runs;
}
function wordParagraph(pXml) {
  const style = (pXml.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || "";
  const runs = wordRuns(pXml);
  const text = runs.map((r) => r.text).join("");
  if (!text.trim()) return null;
  const h = /^(Title)$/i.test(style) ? 1 : (style.match(/^Heading(\d)$/i) || style.match(/^Titlu(\d)$/i) || [])[1];
  if (h) return { t: "h", level: Math.min(4, Number(h)), runs };
  if (/<w:numPr>/.test(pXml) || /^List/i.test(style)) return { t: "li", level: Number((pXml.match(/<w:ilvl w:val="(\d+)"/) || [])[1] || 0), runs };
  if (/Quote/i.test(style)) return { t: "quote", runs };
  return { t: "p", runs };
}
async function previewDocx(zip) {
  const xml = await entry(zip, "word/document.xml");
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [, xml])[1];
  const blocks = [];
  // An empty paragraph is written "<w:p/>": matched on its own, so it never swallows the table after it.
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*?)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    if (blocks.length >= LIMITS.blocks) break;
    if (m[0].endsWith("/>") && !m[0].includes("</w:p>")) continue;
    if (m[0].startsWith("<w:tbl>")) {
      const rows = [];
      for (const tr of m[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const cells = [...tr[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((tc) => [...tc[0].matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((p) => wordRuns(p[0]).map((r) => r.text).join("")).join("\n").slice(0, LIMITS.cellChars));
        if (cells.length) rows.push(cells.slice(0, LIMITS.cols));
        if (rows.length >= LIMITS.rows) break;
      }
      if (rows.length) blocks.push({ t: "table", rows });
    } else { const p = wordParagraph(m[0]); if (p) blocks.push(p); }
  }
  return { kind: "docx", blocks };
}

// ---------- PowerPoint ----------
function drawingParagraphs(xml) {
  const lines = [];
  for (const p of String(xml).matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const inner = p[1] ?? p[2] ?? "";
    const text = [...inner.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\/>/g)].map((t) => (t[1] != null ? decode(t[1]) : "\n")).join("");
    if (!text.trim()) continue;
    const level = Number((inner.match(/<a:pPr[^>]*\blvl="(\d+)"/) || [])[1] || 0);
    const bullet = /<a:buChar|<a:buAutoNum/.test(inner) || /^[•\-–]\s/.test(text);
    lines.push({ text: text.replace(/^[•\-–]\s+/, ""), level, bullet });
  }
  return lines;
}
async function previewPptx(zip) {
  const pres = await entry(zip, "ppt/presentation.xml"), rels = relTargets(await entry(zip, "ppt/_rels/presentation.xml.rels"), "ppt/");
  let files = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => rels.get(m[1])).filter((f) => f && zip.file(f));
  if (!files.length) files = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const slides = [];
  for (const f of files.slice(0, LIMITS.slides)) {
    const xml = await entry(zip, f);
    let title = "", lines = [], tables = [];
    for (const sp of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
      const paras = drawingParagraphs(sp[0]);
      if (!paras.length) continue;
      if (!title && /<p:ph[^>]*type="(title|ctrTitle)"/.test(sp[0])) { title = paras.map((p) => p.text).join(" "); continue; }
      lines.push(...paras);
    }
    for (const tbl of xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)) {
      const rows = [...tbl[0].matchAll(/<a:tr\b[\s\S]*?<\/a:tr>/g)].map((tr) => [...tr[0].matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)].map((tc) => drawingParagraphs(tc[0]).map((p) => p.text).join("\n").slice(0, LIMITS.cellChars)).slice(0, LIMITS.cols));
      if (rows.length) tables.push(rows.slice(0, 60));
    }
    // Files made without title placeholders (Serasmart's own): the first short line on the slide is its title.
    if (!title && lines.length && lines[0].text.length <= 120 && !lines[0].bullet) title = lines.shift().text;
    slides.push({ title, lines: lines.slice(0, 60), tables });
  }
  return { kind: "pptx", slides };
}

// ---------- Excel ----------
function colIndex(letters) { let n = 0; for (const ch of String(letters).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
function colName(i) { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

// A small formula reader, only for showing values: numbers, cells and ranges (also on other sheets), + − × ÷ ^ &,
// comparisons and SUM / AVERAGE / MIN / MAX / COUNT / COUNTA / ROUND / ABS / IF / AND / OR / CONCAT. Anything else
// shows the formula itself.
function makeEvaluator(sheets) {
  const byName = new Map(sheets.map((s) => [s.name.toLowerCase(), s]));
  const busy = new Set();
  function cellValue(sheet, r, c) {
    const cell = sheet.cells.get(`${r},${c}`);
    if (!cell) return null;
    if (cell.formula && cell.value == null) {
      const key = `${sheet.name}!${r},${c}`;
      if (busy.has(key)) throw new Error("cycle");
      busy.add(key);
      try { cell.value = evaluate(sheet, cell.formula); } catch { cell.value = "=" + cell.formula; cell.error = true; } finally { busy.delete(key); }
    }
    return cell.value;
  }
  function evaluate(sheet, src) {
    const tokens = [];
    const re = /\s*(?:(\d+(?:\.\d+)?(?:E[+-]?\d+)?)|"((?:[^"]|"")*)"|((?:'[^']+'|[A-Za-z_][\w.]*)!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![\w(])|([A-Za-z][A-Za-z0-9.]*)\s*\(|(<>|<=|>=|[-+*/^&=<>(),:%]))/gy;
    let m, last = 0;
    while (last < src.length && (m = re.exec(src))) {
      last = re.lastIndex;
      if (m[1]) tokens.push({ k: "n", v: Number(m[1]) });
      else if (m[2] != null) tokens.push({ k: "s", v: m[2].replace(/""/g, '"') });
      else if (m[4]) tokens.push({ k: "ref", sheet: m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, "") : null, c1: colIndex(m[4]), r1: Number(m[5]) - 1, c2: m[6] ? colIndex(m[6]) : null, r2: m[7] ? Number(m[7]) - 1 : null });
      else if (m[8]) tokens.push({ k: "fn", v: m[8].toUpperCase() });
      else if (m[9]) tokens.push({ k: "op", v: m[9] });
    }
    if (last < src.replace(/\s+$/, "").length) throw new Error("unsupported");
    let i = 0;
    const peek = () => tokens[i], take = () => tokens[i++];
    const num = (v) => { if (v == null || v === "") return 0; if (typeof v === "boolean") return v ? 1 : 0; const n = Number(v); if (!Number.isFinite(n)) throw new Error("value"); return n; };
    const flat = (v) => (Array.isArray(v) ? v.flat(Infinity) : [v]);
    function refValues(t) {
      const sh = t.sheet ? byName.get(t.sheet.toLowerCase()) : sheet;
      if (!sh) throw new Error("ref");
      if (t.c2 == null) return cellValue(sh, t.r1, t.c1);
      const out = [];
      for (let r = Math.min(t.r1, t.r2); r <= Math.max(t.r1, t.r2) && r < LIMITS.rows * 4; r++) for (let c = Math.min(t.c1, t.c2); c <= Math.max(t.c1, t.c2) && c < 200; c++) out.push(cellValue(sh, r, c));
      return out;
    }
    const FN = {
      SUM: (a) => flat(a).filter((v) => typeof v === "number").reduce((s, v) => s + v, 0),
      AVERAGE: (a) => { const n = flat(a).filter((v) => typeof v === "number"); if (!n.length) throw new Error("div0"); return n.reduce((s, v) => s + v, 0) / n.length; },
      MIN: (a) => Math.min(...flat(a).filter((v) => typeof v === "number")),
      MAX: (a) => Math.max(...flat(a).filter((v) => typeof v === "number")),
      COUNT: (a) => flat(a).filter((v) => typeof v === "number").length,
      COUNTA: (a) => flat(a).filter((v) => v != null && v !== "").length,
      // Like Excel: halves go away from zero, without binary rounding errors (30.5 × 0.21 = 6.405 → 6.41).
      ROUND: (a) => { const x = num(a[0]), d = Math.trunc(num(a[1] ?? 0)), v = Math.abs(Number(x.toPrecision(15))); const r = Number(Math.round(Number(v + "e" + d)) + "e" + -d); return Math.sign(x) * (Number.isFinite(r) ? r : Math.round(v * 10 ** d) / 10 ** d); },
      ABS: (a) => Math.abs(num(a[0])),
      IF: (a) => (truthy(a[0]) ? a[1] ?? true : a[2] ?? false),
      AND: (a) => flat(a).every(truthy), OR: (a) => flat(a).some(truthy),
      CONCAT: (a) => flat(a).map((v) => (v == null ? "" : String(v))).join(""), CONCATENATE: (a) => flat(a).map((v) => (v == null ? "" : String(v))).join("")
    };
    function truthy(v) { return typeof v === "string" ? v.toUpperCase() === "TRUE" : !!num(v); }
    function primary() {
      const t = take();
      if (!t) throw new Error("end");
      if (t.k === "n" || t.k === "s") return t.v;
      if (t.k === "ref") return refValues(t);
      if (t.k === "fn") {
        const args = [];
        if (!(peek()?.k === "op" && peek().v === ")")) { do { args.push(compare()); } while (peek()?.k === "op" && peek().v === "," && take()); }
        if (take()?.v !== ")") throw new Error("paren");
        if (!FN[t.v]) throw new Error("fn");
        return FN[t.v](args);
      }
      if (t.v === "(") { const v = compare(); if (take()?.v !== ")") throw new Error("paren"); return v; }
      if (t.v === "-") return -num(unary());
      if (t.v === "+") return num(unary());
      throw new Error("token");
    }
    function unary() { let v = primary(); if (peek()?.v === "%") { take(); v = num(v) / 100; } return v; }
    function power() { let v = unary(); while (peek()?.v === "^") { take(); v = num(v) ** num(unary()); } return v; }
    function product() { let v = power(); while (peek()?.v === "*" || peek()?.v === "/") { const op = take().v, b = num(power()); if (op === "/" && b === 0) throw new Error("div0"); v = op === "*" ? num(v) * b : num(v) / b; } return v; }
    function sum() { let v = product(); while (peek()?.v === "+" || peek()?.v === "-") { const op = take().v, b = num(product()); v = op === "+" ? num(v) + b : num(v) - b; } return v; }
    function concat() { let v = sum(); while (peek()?.v === "&") { take(); v = String(v ?? "") + String(sum() ?? ""); } return v; }
    function compare() {
      let v = concat();
      while (peek()?.k === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(peek().v)) {
        const op = take().v, b = concat(), x = typeof v === "number" && typeof b === "number" ? [v, b] : [String(v ?? ""), String(b ?? "")];
        v = op === "=" ? x[0] === x[1] : op === "<>" ? x[0] !== x[1] : op === "<" ? x[0] < x[1] : op === ">" ? x[0] > x[1] : op === "<=" ? x[0] <= x[1] : x[0] >= x[1];
      }
      return v;
    }
    const result = compare();
    if (i < tokens.length) throw new Error("rest");
    if (Array.isArray(result)) throw new Error("range");
    return typeof result === "number" ? Math.round(result * 1e10) / 1e10 : result;
  }
  return { cellValue };
}

async function previewXlsx(zip) {
  const shared = [...(await entry(zip, "xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join(""));
  const book = await entry(zip, "xl/workbook.xml"), rels = relTargets(await entry(zip, "xl/_rels/workbook.xml.rels"), "xl/");
  const sheets = [];
  for (const m of book.matchAll(/<sheet\b[^>]*>/g)) {
    if (sheets.length >= LIMITS.sheets) break;
    const name = decode((m[0].match(/\bname="([^"]*)"/) || [])[1] || `Sheet ${sheets.length + 1}`), file = rels.get((m[0].match(/\br:id="([^"]+)"/) || [])[1]);
    const xml = file ? await entry(zip, file) : "";
    const cells = new Map();
    let maxR = -1, maxC = -1;
    for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      for (const c of String(row[1] || "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/\br="([A-Z]+)(\d+)"/) || []);
        if (!ref[1]) continue;
        const r = Number(ref[2]) - 1, col = colIndex(ref[1]);
        if (r >= LIMITS.rows || col >= LIMITS.cols) continue;
        const type = (c[1].match(/\bt="([^"]+)"/) || [])[1], body = c[2] || "";
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1], f = (body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/) || [])[1];
        let value = null;
        if (type === "s" && v != null) value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decode(t[1])).join("");
        else if (type === "b" && v != null) value = v === "1";
        else if (type === "str" && v != null) value = decode(v);
        else if (v != null) { const n = Number(v); value = Number.isFinite(n) ? n : decode(v); }
        cells.set(`${r},${col}`, { value, formula: f != null ? decode(f) : null });
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, col);
      }
    }
    sheets.push({ name, cells, maxR, maxC });
  }
  const ev = makeEvaluator(sheets);
  return {
    kind: "xlsx",
    sheets: sheets.map((s) => {
      const rows = [];
      for (let r = 0; r <= s.maxR; r++) {
        const row = [];
        for (let c = 0; c <= s.maxC; c++) {
          const cell = s.cells.get(`${r},${c}`);
          if (!cell) { row.push(null); continue; }
          const value = ev.cellValue(s, r, c);
          row.push({ v: typeof value === "string" ? value.slice(0, LIMITS.cellChars) : value, ...(cell.formula ? { f: "=" + cell.formula } : {}), ...(cell.error ? { e: true } : {}) });
        }
        rows.push(row);
      }
      return { name: s.name, columns: Array.from({ length: s.maxC + 1 }, (_, i) => colName(i)), rows };
    })
  };
}

const KINDS = { docx: previewDocx, pptx: previewPptx, xlsx: previewXlsx };
function officeKind(name, mime) {
  const n = String(name || "").toLowerCase(), m = String(mime || "").toLowerCase();
  if (n.endsWith(".docx") || m.includes("wordprocessingml")) return "docx";
  if (n.endsWith(".pptx") || m.includes("presentationml")) return "pptx";
  if (n.endsWith(".xlsx") || m.includes("spreadsheetml")) return "xlsx";
  return "";
}
async function officePreview(buffer, name, mime) {
  const kind = officeKind(name, mime);
  if (!kind) return null;
  if (!buffer || buffer.length > 60 * 1024 * 1024) throw new Error("The file is too big to show here.");
  const zip = await JSZip.loadAsync(buffer);
  return KINDS[kind](zip);
}

module.exports = { officePreview, officeKind, makeEvaluator };
