import React, { useEffect, useState } from "react";
import { Download, X, Pencil } from "lucide-react";
import { api, authedFetch, useAuthedBlobUrl, useModal, mediaKind, downloadLibraryFile, toast, formatBytes } from "./core.jsx";
import { t as tr } from "./i18n.jsx";

// The file's name, with tr("Rename"): the name changes in the Library and in the conversations that show the file
// (the app hears "serasmart:file-renamed"). Without an extension the server keeps the old one.
export function FileName({ id, name, onRenamed }) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(name || ""), [busy, setBusy] = useState(false);
  useEffect(() => { if (!editing) setValue(name || ""); }, [name, editing]);
  const cancel = () => { setEditing(false); setValue(name || ""); };
  async function save(e) {
    e?.preventDefault();
    const next = value.trim();
    if (!next || next === name) { cancel(); return; }
    setBusy(true);
    try {
      const r = await api(`/api/library/${id}`, { method: "PATCH", body: JSON.stringify({ name: next }) });
      const saved = r?.data?.name || next;
      window.dispatchEvent(new CustomEvent("serasmart:file-renamed", { detail: { id, name: saved } }));
      onRenamed?.(saved); setEditing(false);
      toast(tr("The file is now called «{name}».",{name:saved}), "ok");
    } catch (err) { toast(tr("Rename: {error}",{error:err.message})); }
    finally { setBusy(false); }
  }
  if (!editing) return <span className="fileNameRow"><b title={name}>{name || tr("File")}</b>{id && <button type="button" className="iconOnly smallIcon" onClick={() => setEditing(true)} aria-label={tr("Rename the file")} title={tr("Rename")}><Pencil size={14}/></button>}</span>;
  return <form className="renameForm" onSubmit={save}>
    <input value={value} onChange={e => setValue(e.target.value)} autoFocus maxLength={180} aria-label={tr("File name")} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); } }}/>
    <button type="submit" className="smallBtn" disabled={busy}>{busy ? tr("Saving…") : tr("Save")}</button>
    <button type="button" className="smallBtn" onClick={cancel}>{tr("Cancel")}</button>
  </form>;
}

// 0.7.34: Word, PowerPoint and Excel are shown as they look (pages, slides, sheets) from GET /api/library/:id/office;
// if that fails, the plain text preview is used as before.
const OFFICE_EXT = /\.(docx|pptx|xlsx)$/i;
function Runs({ runs }) {
  return (runs || []).map((r, i) => { let el = r.text; if (r.i) el = <em key={"i" + i}>{el}</em>; if (r.b) el = <strong key={"b" + i}>{el}</strong>; return <React.Fragment key={i}>{el}</React.Fragment>; });
}
function TableView({ rows }) {
  if (!rows?.length) return null;
  const [head, ...body] = rows;
  return <div className="officeTableWrap"><table className="officeTable"><thead><tr>{head.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{body.map((row, r) => <tr key={r}>{row.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table></div>;
}
function DocxView({ data }) {
  return <div className="officePaper">{data.blocks.map((b, i) => {
    if (b.t === "h") { const H = "h" + Math.min(4, b.level + 1); return <H key={i}><Runs runs={b.runs}/></H>; }
    if (b.t === "li") return <div key={i} className="officeLi" style={{ marginLeft: 18 + b.level * 18 }}>• <Runs runs={b.runs}/></div>;
    if (b.t === "quote") return <blockquote key={i}><Runs runs={b.runs}/></blockquote>;
    if (b.t === "table") return <TableView key={i} rows={b.rows}/>;
    return <p key={i}><Runs runs={b.runs}/></p>;
  })}{!data.blocks.length && <p className="officeEmpty">{tr("This document is empty.")}</p>}</div>;
}
function PptxView({ data }) {
  return <div className="officeSlides">{data.slides.map((sl, i) => <section key={i} className="officeSlide" aria-label={`Slide ${i + 1}`}>
    <span className="officeSlideNo">{i + 1} / {data.slides.length}</span>
    {sl.title && <h3>{sl.title}</h3>}
    {sl.lines.length > 0 && <ul>{sl.lines.map((l, k) => <li key={k} className={l.bullet ? "" : "plain"} style={{ marginLeft: l.level * 18 }}>{l.text}</li>)}</ul>}
    {sl.tables.map((t, k) => <TableView key={k} rows={t}/>)}
  </section>)}</div>;
}
function cellText(c) {
  if (!c) return "";
  if (typeof c.v === "number") return c.v.toLocaleString("ro-RO", { maximumFractionDigits: 10 });
  if (typeof c.v === "boolean") return c.v ? "TRUE" : "FALSE";
  return c.v == null ? "" : String(c.v);
}
function XlsxView({ data }) {
  const [tab, setTab] = useState(0);
  const sheet = data.sheets[Math.min(tab, data.sheets.length - 1)];
  if (!sheet) return <p className="officeEmpty">{tr("This workbook is empty.")}</p>;
  return <div className="officeBook">
    <div className="officeSheetWrap"><table className="officeGrid">
      <thead><tr><th className="corner"></th>{sheet.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{sheet.rows.map((row, r) => <tr key={r}><th>{r + 1}</th>{sheet.columns.map((_, c) => { const cell = row[c]; return <td key={c} className={[typeof cell?.v === "number" ? "num" : "", r === 0 ? "head" : "", cell?.e ? "err" : ""].join(" ")} title={cell?.f || undefined}>{cellText(cell)}</td>; })}</tr>)}</tbody>
    </table></div>
    {data.sheets.length > 1 && <div className="officeTabs" role="tablist">{data.sheets.map((s, i) => <button key={i} role="tab" aria-selected={i === tab} className={i === tab ? "active" : ""} onClick={() => setTab(i)}>{s.name}</button>)}</div>}
  </div>;
}
function OfficeView({ data }) {
  if (data.kind === "docx") return <DocxView data={data}/>;
  if (data.kind === "pptx") return <PptxView data={data}/>;
  if (data.kind === "xlsx") return <XlsxView data={data}/>;
  return null;
}

// Opens a file from the Library or a generated file inside Serasmart AI, without downloading it: images, video and audio
// play here, PDFs open in the built-in reader, and Word / PowerPoint / Excel / text show their content.
function viewKind(mime, name) {
  const m = String(mime || "").toLowerCase(), n = String(name || "").toLowerCase();
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  const k = mediaKind(mime, name);
  if (k !== "file") return k;
  if (/officedocument|msword|ms-excel|ms-powerpoint|opendocument/.test(m) || /\.(docx?|pptx?|xlsx?|od[tsp]|rtf)$/.test(n)) return "office";
  return "file";
}

export function canView(file) { return viewKind(file?.mimeType || file?.mime, file?.name) !== "file"; }

// Chrome on Android (and other browsers without a PDF reader) cannot show a PDF inside the page: there the PDF's text is shown.
const PDF_INLINE = typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;

export function FileViewer({ file, onClose }) {
  const id = file?.libraryId || file?.id;
  const found = viewKind(file?.mimeType || file?.mime, file?.name);
  const kind = found === "pdf" && !PDF_INLINE ? "office" : found;
  const blobPath = ["image", "video", "audio", "pdf"].includes(kind) && id ? `/api/library/${id}/content` : "";
  const { src, failed } = useAuthedBlobUrl(blobPath);
  const richOffice = kind === "office" && OFFICE_EXT.test(String(file?.name || ""));
  const [office, setOffice] = useState({ data: null, loading: richOffice, failed: false });
  const [text, setText] = useState({ value: "", loading: kind === "text" || (kind === "office" && !richOffice), error: "" });
  useEffect(() => {
    if (!id || !richOffice) return;
    let active = true;
    api(`/api/library/${id}/office`).then((d) => { if (active) setOffice({ data: d.data, loading: false, failed: false }); })
      .catch(() => { if (active) { setOffice({ data: null, loading: false, failed: true }); setText((t) => ({ ...t, loading: true })); } });
    return () => { active = false; };
  }, [id, richOffice]);
  const { ref, backdropProps } = useModal(onClose);
  const [name, setName] = useState(file?.name || "");
  useEffect(() => {
    if (!id || (kind !== "text" && kind !== "office") || (richOffice && !office.failed)) return;
    let active = true;
    (async () => {
      try {
        const r = await authedFetch(kind === "text" ? `/api/library/${id}/content` : `/api/library/${id}/preview`);
        const value = kind === "text" ? await r.text() : String((await r.json())?.data?.text || "");
        if (active) setText({ value: value || tr("The file has no text that can be shown."), loading: false, error: "" });
      } catch (e) { if (active) setText({ value: "", loading: false, error: e.message }); }
    })();
    return () => { active = false; };
  }, [id, kind, richOffice, office.failed]);
  async function download() { try { await downloadLibraryFile({ libraryId: id, name }); } catch (e) { toast(e.message); } }
  const loading = blobPath ? !src && !failed : richOffice && !office.failed ? office.loading : text.loading;
  return <div className="modalBackdrop viewerBackdrop" {...backdropProps}>
    <div className={"fileViewer " + kind + (office.data ? " rich " + office.data.kind : "")} ref={ref} role="dialog" aria-modal="true" aria-label={name || tr("File")} tabIndex={-1}>
      <div className="viewerHead">
        <div><FileName id={id} name={name} onRenamed={setName}/>{file?.size ? <small>{formatBytes(file.size)}</small> : null}</div>
        <button type="button" className="secondary" onClick={download}><Download size={15}/> {tr("Download")}</button>
        <button type="button" className="iconOnly" onClick={onClose} aria-label={tr("Close")} title={tr("Close")}><X size={20}/></button>
      </div>
      <div className="viewerBody">
        {loading && <div className="mediaPlaceholder">{tr("Opening…")}</div>}
        {failed && <div className="mediaPlaceholder">{tr("The file is no longer available.")}</div>}
        {src && kind === "image" && <img src={src} alt={name || ""}/>}
        {src && kind === "video" && <video src={src} controls autoPlay playsInline/>}
        {src && kind === "audio" && <audio src={src} controls autoPlay/>}
        {src && kind === "pdf" && <iframe src={src} title={name || "PDF"}/>}
        {office.data && <OfficeView data={office.data}/>}
        {!text.loading && !office.data && !(richOffice && !office.failed) && (kind === "text" || kind === "office") && (text.error ? <div className="mediaPlaceholder">{text.error}</div> : <pre className="viewerText">{text.value}</pre>)}
        {kind === "file" && <div className="mediaPlaceholder">{tr("This kind of file cannot be opened here. Use «Download».")}</div>}
      </div>
    </div>
  </div>;
}
