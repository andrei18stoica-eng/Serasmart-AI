import React, { useEffect, useRef, useState } from "react";
import { Plus, Search, Check, Trash2, RefreshCw, ShieldCheck, Link2, Wrench, X } from "lucide-react";
import { api, toast, cx, openLink } from "../core.jsx";
import { t as tr, useLanguage } from "../i18n.jsx";
import { BRAND_NAME } from "../brand.js";

// Connected apps (0.7.29), like the connectors in Claude: the person connects an app (it signs in on the app's own page),
// and in chat the AI can search, read, create and edit in it. Every action waits for «Allow once», «Always allow» or
// «Deny»; «Always allow» choices are listed here and can be taken back. Letters stand in for the apps' logos.
const initials = (name) => String(name || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const STATUS = { connected: "Connected", pending: "Waiting for sign-in", signin: "Sign in again", error: "Needs attention" };

function openSignIn(url) {
  // The web version opens a small window that closes itself; the desktop app opens the browser.
  if (!window.Serasmart?.openExternal) {
    const w = window.open(url, "serasmart-connect", "width=560,height=760");
    if (w) return;
  }
  openLink(url);
}

export function ConnectorsPanel() {
  useLanguage();
  const [data, setData] = useState({ catalog: [], connected: [], approvals: [] });
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(""), [query, setQuery] = useState("");
  const [tokenFor, setTokenFor] = useState(null), [token, setToken] = useState("");
  const [custom, setCustom] = useState({ url: "", name: "", token: "" }), [showCustom, setShowCustom] = useState(false);
  const [tools, setTools] = useState({}), [note, setNote] = useState(null);
  const mounted = useRef(true), poll = useRef(null);
  useEffect(() => () => { mounted.current = false; clearInterval(poll.current); }, []);
  async function load() {
    try { const d = await api("/api/connectors"); if (mounted.current) setData(d.data || { catalog: [], connected: [], approvals: [] }); return d.data; }
    catch (e) { if (mounted.current) setNote({ kind: "error", text: tr("The apps could not be loaded: {error}", { error: e.message }) }); return null; }
    finally { if (mounted.current) setLoading(false); }
  }
  useEffect(() => {
    load();
    // Back from the sign-in window or the browser: the list refreshes.
    const onMessage = (e) => { if (e?.data && typeof e.data === "object" && "serasmartConnector" in e.data) load(); };
    const onFocus = () => load();
    window.addEventListener("message", onMessage); window.addEventListener("focus", onFocus);
    return () => { window.removeEventListener("message", onMessage); window.removeEventListener("focus", onFocus); };
  }, []);
  // After Connect, the list is read every 3 seconds for 3 minutes, until the app is connected.
  function waitFor(connectorId, name) {
    clearInterval(poll.current);
    const until = Date.now() + 180000;
    poll.current = setInterval(async () => {
      const d = await load();
      const c = d?.connected?.find((x) => x.id === connectorId);
      if (c?.status === "connected") { clearInterval(poll.current); setNote({ kind: "ok", text: tr("{name} is connected. Ask in chat; the AI asks you before every action.", { name }) }); }
      else if (Date.now() > until) clearInterval(poll.current);
    }, 3000);
  }
  async function connect(body, name) {
    if (busy) return;
    setBusy(body.catalogId || body.url); setNote(null);
    try {
      const d = await api("/api/connectors/connect", { method: "POST", body: JSON.stringify(body) });
      const out = d.data || {};
      if (out.status === "authorize" && out.authorizeUrl) {
        setNote({ kind: "info", text: tr("Sign in to {name} in the window that opened, then come back here.", { name }) });
        openSignIn(out.authorizeUrl); waitFor(out.connector?.id, name);
      } else setNote({ kind: "ok", text: tr("{name} is connected. Ask in chat; the AI asks you before every action.", { name }) });
      setTokenFor(null); setToken(""); await load();
      return true;
    } catch (e) { setNote({ kind: "error", text: e.message }); return false; }
    finally { if (mounted.current) setBusy(""); }
  }
  async function disconnect(c) {
    if (!confirm(tr("Disconnect {name}? The AI will no longer reach it.", { name: c.name }))) return;
    try { await api(`/api/connectors/${c.id}`, { method: "DELETE" }); await load(); } catch (e) { toast(e.message); }
  }
  async function showTools(c) {
    if (tools[c.id]) { setTools((t) => { const n = { ...t }; delete n[c.id]; return n; }); return; }
    setTools((t) => ({ ...t, [c.id]: "loading" }));
    try { const d = await api(`/api/connectors/${c.id}/tools`); setTools((t) => ({ ...t, [c.id]: d.data || [] })); }
    catch (e) { setTools((t) => ({ ...t, [c.id]: { error: e.message } })); load(); }
  }
  async function revoke(a) {
    try { await api(`/api/connectors/approvals/${a.id}`, { method: "DELETE" }); await load(); } catch (e) { toast(e.message); }
  }
  const q = query.trim().toLowerCase();
  const catalog = data.catalog.filter((x) => !q || x.name.toLowerCase().includes(q) || x.category.toLowerCase().includes(q) || x.description.toLowerCase().includes(q));
  const groups = [...new Set(catalog.map((x) => x.category))];
  const nameOf = (connId) => data.connected.find((c) => c.id === connId)?.name || "";

  return <div className="connectorsPanel">
    {note && <div className={cx("connNote", note.kind)} role="status">{note.text}<button className="iconPlain" onClick={() => setNote(null)} aria-label={tr("Close")}><X size={13} /></button></div>}
    <section className="catalogSection">
      <h3>{tr("Your apps")}</h3>
      {loading ? <div className="emptyState small">{tr("Loading…")}</div> : !data.connected.length ? <p className="settingsHelp">{tr("No app connected yet. Pick one below: after you sign in, {brand} can search, read, create and edit in it, and asks you before every action.", { brand: BRAND_NAME })}</p>
        : <div className="plugCards">{data.connected.map((c) => <div key={c.id} className={cx("plugCard", c.status !== "connected" && "off")}>
          <div className="plugCardTop"><span className="pluginLogo"><span>{initials(c.name)}</span></span><div className="plugCardText"><b title={c.name}>{c.name}</b><small>{tr(STATUS[c.status] || c.status)}{c.status === "connected" && c.toolCount ? ` · ${tr("{n} actions", { n: c.toolCount })}` : ""}</small></div></div>
          {c.error && c.status !== "connected" && <small className="connError">{c.error}</small>}
          {tools[c.id] && <div className="connTools">{tools[c.id] === "loading" ? tr("Loading…") : tools[c.id].error ? <span className="connError">{tools[c.id].error}</span> : tools[c.id].map((t) => <span key={t.name} className={cx("connTool", t.readOnly && "read")} title={t.description}>{t.title}</span>)}</div>}
          <div className="plugCardActions">
            {c.status === "connected" ? <button className="smallBtn" onClick={() => showTools(c)}><Wrench size={13} /> {tools[c.id] ? tr("Hide actions") : tr("Actions")}</button>
              : <button className="smallBtn addBtn" disabled={!!busy} onClick={() => connect(c.catalogId ? { catalogId: c.catalogId } : { url: c.url, name: c.name }, c.name)}><RefreshCw size={13} /> {tr("Sign in again")}</button>}
            <button className="smallBtn dangerSmall" onClick={() => disconnect(c)}><Trash2 size={13} /> {tr("Disconnect")}</button>
          </div>
        </div>)}</div>}
    </section>
    {data.approvals.length > 0 && <section className="catalogSection">
      <h3><ShieldCheck size={15} /> {tr("Always allowed")}</h3>
      <p className="settingsHelp">{tr("These actions run without asking. Remove one and the AI asks you again.")}</p>
      <div className="connApprovals">{data.approvals.map((a) => <div key={a.id} className="connApproval"><span><b>{a.app || nameOf(a.connId)}</b> · {a.tool}</span><button className="smallBtn" onClick={() => revoke(a)}>{tr("Remove")}</button></div>)}</div>
    </section>}
    <section className="catalogSection">
      <div className="connHead"><h3>{tr("Connect an app")}</h3><button className="smallBtn" onClick={() => setShowCustom((v) => !v)}><Link2 size={13} /> {tr("Custom app")}</button></div>
      {showCustom && <form className="connCustom" onSubmit={async (e) => { e.preventDefault(); if (await connect({ url: custom.url, name: custom.name, token: custom.token || undefined }, custom.name || custom.url)) setCustom({ url: "", name: "", token: "" }); }}>
        <p className="settingsHelp">{tr("Any app with a remote MCP server (an address that starts with https://). Leave the token empty if the app has its own sign-in.")}</p>
        <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder={tr("Name")} maxLength={80} />
        <input value={custom.url} onChange={(e) => setCustom({ ...custom, url: e.target.value })} placeholder="https://…/mcp" required />
        <input value={custom.token} onChange={(e) => setCustom({ ...custom, token: e.target.value })} placeholder={tr("Token (optional)")} type="password" autoComplete="off" />
        <button className="primary" disabled={!!busy || !custom.url.trim()}><Plus size={14} /> {tr("Connect")}</button>
      </form>}
      <div className="pageSearch"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Search apps")} aria-label={tr("Search apps")} /></div>
      {groups.map((g) => <div key={g} className="connGroup"><h4>{tr(g)}</h4><div className="catalogGrid">
        {catalog.filter((x) => x.category === g).map((x) => <div key={x.id} className={cx("catalogCard", x.unavailable && "locked")} title={x.unavailable ? tr(x.unavailable) : ""}>
          <span className="pluginLogo"><span>{initials(x.name)}</span></span>
          <div className="catalogText"><b>{x.name}</b><small>{x.unavailable ? tr(x.unavailable) : tr(x.description)}</small>
            {tokenFor === x.id && <form className="connToken" onSubmit={(e) => { e.preventDefault(); connect({ catalogId: x.id, token }, x.name); }}>
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder={x.tokenHint || tr("Token")} type="password" autoComplete="off" autoFocus />
              <button className="smallBtn addBtn" disabled={!token.trim() || !!busy}>{tr("Connect")}</button>
            </form>}
          </div>
          {x.connected ? <span className="smallBtn installed"><Check size={13} /> {tr("Connected")}</span>
            : <button className="smallBtn addBtn" disabled={!!x.unavailable || busy === x.id} onClick={() => x.auth === "token" ? setTokenFor(tokenFor === x.id ? null : x.id) : connect({ catalogId: x.id }, x.name)}>
              <Plus size={13} /> {busy === x.id ? tr("Connecting…") : tr("Connect")}</button>}
        </div>)}
      </div></div>)}
      {!groups.length && !loading && <div className="emptyState small">{tr("No app found. You can add it with «Custom app» if it has an MCP address.")}</div>}
    </section>
  </div>;
}

// In chat: the card for an action the AI wants to take in a connected app.
const RUN_STATUS = { ask: "Wants to", running: "Working in", done: "Used", denied: "Denied", error: "Failed in" };
export const decideToolRun = (callId, decision) => api("/api/connectors/approve", { method: "POST", body: JSON.stringify({ callId, decision }) });
export function ToolRunCard({ run, onDecide = decideToolRun }) {
  useLanguage();
  const [sent, setSent] = useState("");
  const args = run.args && Object.keys(run.args).length ? JSON.stringify(run.args, null, 2) : "";
  async function decide(decision) {
    if (sent) return; setSent(decision);
    try { await onDecide(run.id, decision); } catch (e) { setSent(""); toast(e.message); }
  }
  return <div className={cx("toolRun", run.status)}>
    <div className="toolRunHead"><span className="pluginLogo small"><span>{initials(run.app)}</span></span>
      <span className="toolRunTitle"><b>{run.app}</b> · {tr(RUN_STATUS[run.status] || run.status)} <em>{run.title}</em>{run.readOnly ? <small> · {tr("read only")}</small> : null}</span></div>
    {run.status === "ask" && <>
      {args && <pre className="toolRunArgs">{args}</pre>}
      <div className="toolRunActions">
        <button className="primary" disabled={!!sent} onClick={() => decide("once")}>{tr("Allow once")}</button>
        <button className="secondary" disabled={!!sent} onClick={() => decide("always")}>{tr("Always allow")}</button>
        <button className="secondary danger" disabled={!!sent} onClick={() => decide("deny")}>{tr("Deny")}</button>
      </div>
    </>}
    {run.status !== "ask" && run.summary && <details className="toolRunResult"><summary>{tr("Result")}</summary><pre>{run.summary}</pre></details>}
  </div>;
}
