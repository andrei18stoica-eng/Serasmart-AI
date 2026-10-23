import React, { useEffect, useRef, useState } from "react";
import { Download, Trash2, LogOut, KeyRound, Monitor, Smartphone, Camera, Copy, Check } from "lucide-react";
import { api, toast, storage, TOKEN_KEY, GATEWAY, authHeaders, saveBlobDownload, Switch, cx, writeClipboardText } from "../core.jsx";
import { PreferenceSwitches } from "./Memory.jsx";
import { BRAND_NAME } from "../brand.js";
import { t as tr, useLanguage } from "../i18n.jsx";

// Settings of each account (0.7.23, phase 3): profile and personalisation, notifications, privacy and security. Saved on
// the server for this account only; the machine settings (keys, OmniRoute, media) stay in the other tabs, for the Owner.
const TONES = [["default", "Default"], ["professional", "Professional"], ["friendly", "Friendly"], ["direct", "Direct and honest"], ["concise", "Short and to the point"], ["detailed", "Detailed"], ["creative", "Creative"]];
const LANGS = [["auto", "The language I write in"], ["ro", "Always in Romanian"], ["en", "Always in English"]];
const KEEP = [[0, "Forever"], [30, "30 days"], [90, "90 days"], [365, "One year"]];

// 0.7.35: the profile photo, shared by the settings and the account corner of the sidebar.
let avatarNow = null; const avatarListeners = new Set();
function setAvatarNow(v) { avatarNow = v || ""; avatarListeners.forEach((fn) => fn(avatarNow)); }
export function AccountAvatar({ user, className = "accountAvatar" }) {
  const [src, setSrc] = useState(avatarNow);
  useEffect(() => {
    avatarListeners.add(setSrc);
    if (avatarNow === null && storage.get(TOKEN_KEY)) { avatarNow = ""; api("/api/me/settings").then((d) => setAvatarNow(d?.data?.avatar || "")).catch(() => {}); }
    return () => avatarListeners.delete(setSrc);
  }, []);
  const letter = (user?.name || user?.email || "S")[0].toUpperCase();
  return <div className={cx(className, src && "hasPhoto")}>{src ? <img src={src} alt="" /> : letter}</div>;
}
// A picture of up to 10 MB becomes a 256 px square (WebP, or JPEG where WebP cannot be made), centred and cropped.
async function squarePhoto(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error(tr("Choose a PNG, JPEG or WebP picture."));
  if (file.size > 10 * 1024 * 1024) throw new Error(tr("The picture is larger than 10 MB."));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error(tr("The picture could not be read."))); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas"); c.width = c.height = 256;
    c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    let out = c.toDataURL("image/webp", 0.85);
    if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", 0.85);
    return out;
  } finally { URL.revokeObjectURL(url); }
}
const WORKS = ["Software engineering", "Design", "Marketing", "Sales", "Product management", "Data and analytics", "Finance and accounting", "Legal", "Healthcare", "Education and teaching", "Student", "Research and science", "Writing and content", "Operations", "Customer support", "Human resources", "Business owner"];

export function useAccountSettings() {
  const [data, setData] = useState(null), [error, setError] = useState("");
  const load = () => api("/api/me/settings").then((d) => setData(d.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function save(patch, ok = tr("Saved.")) {
    const d = await api("/api/me/settings", { method: "PATCH", body: JSON.stringify(patch) });
    setData(d.data); if (d.data && "avatar" in patch) setAvatarNow(d.data.avatar); if (ok) toast(ok, "ok"); return d.data;
  }
  return { data, error, save, reload: load };
}

export function ProfileTab({ account, models = [], preferences, onPreferences, prefBusy }) {
  const { data, error, save } = account;
  useLanguage();
  const [f, setF] = useState(null), [busy, setBusy] = useState(""), [other, setOther] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (data && !f) { setF(data); setOther(!!data.occupation && !WORKS.includes(data.occupation)); } }, [data]);
  if (error) return <div className="inlineError">{error}</div>;
  if (!f) return <div className="settingsLoading">{tr("Loading the profile…")}</div>;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const dirty = ["name", "nickname", "occupation", "about", "customInstructions", "tone", "responseLanguage", "preferredModel"].some((k) => f[k] !== data[k]);
  async function submit(e) {
    e.preventDefault(); if (busy) return; setBusy("save");
    try { await save({ name: f.name, nickname: f.nickname, occupation: f.occupation, about: f.about, customInstructions: f.customInstructions, tone: f.tone, responseLanguage: f.responseLanguage, preferredModel: f.preferredModel }, tr("Profile saved.")); }
    catch (err) { toast(err.message); } finally { setBusy(""); }
  }
  async function photo(file) {
    if (!file) return; setBusy("photo");
    try { const avatar = await squarePhoto(file); const d = await save({ avatar }, tr("Profile photo saved.")); setF((x) => ({ ...x, avatar: d.avatar })); }
    catch (err) { toast(err.message); } finally { setBusy(""); if (fileRef.current) fileRef.current.value = ""; }
  }
  async function removePhoto() {
    setBusy("photo");
    try { await save({ avatar: "" }, tr("Profile photo removed.")); setF((x) => ({ ...x, avatar: "" })); } catch (err) { toast(err.message); } finally { setBusy(""); }
  }
  const modelList = [...new Set([f.preferredModel, ...models].filter(Boolean))];
  const work = other ? "__other" : (f.occupation || "");
  return <form className="accountForm settingsSections" onSubmit={submit}>
    <section className="setSection">
      <h3>{tr("Profile")}</h3>
      <div className="setRow photoRow">
        <div className="setRowText"><b>{tr("Profile photo")}</b><span>{tr("PNG, JPEG or WebP, up to 10 MB.")}</span></div>
        <div className="photoControls">
          <div className={cx("profilePhoto", f.avatar && "hasPhoto")}>{f.avatar ? <img src={f.avatar} alt="" /> : (f.name || f.email || "S")[0].toUpperCase()}</div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => photo(e.target.files?.[0])} />
          <button type="button" className="secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}><Camera size={15} /> {busy === "photo" ? tr("Saving…") : f.avatar ? tr("Change") : tr("Upload")}</button>
          {f.avatar && <button type="button" className="linkBtn" onClick={removePhoto} disabled={!!busy}>{tr("Remove")}</button>}
        </div>
      </div>
      <label>{tr("Full name")}<input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required /></label>
      <label>{tr("What should {brand} call you?", { brand: BRAND_NAME })}<input value={f.nickname} onChange={(e) => set("nickname", e.target.value)} maxLength={60} placeholder={f.name || tr("e.g. a name or a nickname")} /></label>
      <label>{tr("What best describes your work?")}
        <select value={work} onChange={(e) => { const v = e.target.value; if (v === "__other") { setOther(true); set("occupation", WORKS.includes(f.occupation) ? "" : f.occupation); } else { setOther(false); set("occupation", v); } }}>
          <option value="">{tr("Select")}</option>
          {WORKS.map((w) => <option key={w} value={w}>{tr(w)}</option>)}
          <option value="__other">{tr("Something else")}</option>
        </select>
      </label>
      {other && <label>{tr("Your work")}<input value={f.occupation} onChange={(e) => set("occupation", e.target.value)} maxLength={120} placeholder={tr("e.g. web designer, accountant, teacher")} autoFocus /></label>}
      <label><span className="labelLine">{tr("Instructions for {brand}", { brand: BRAND_NAME })}</span>
        <span className="labelHelp">{tr("{brand} keeps these in mind in every chat on this account.", { brand: BRAND_NAME })}</span>
        <textarea rows={4} value={f.customInstructions} onChange={(e) => set("customInstructions", e.target.value)} maxLength={3000} placeholder={tr("e.g. ask clarifying questions before giving detailed answers")} /></label>
    </section>
    <section className="setSection">
      <h3>{tr("How the AI answers")}</h3>
      <div className="accountGrid">
        <label>{tr("Tone")}<select value={f.tone} onChange={(e) => set("tone", e.target.value)}>{TONES.map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}</select></label>
        <label>{tr("Answer language")}<select value={f.responseLanguage} onChange={(e) => set("responseLanguage", e.target.value)}>{LANGS.map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}</select></label>
        <label className="span2">{tr("Model for new chats")}<select value={f.preferredModel} onChange={(e) => set("preferredModel", e.target.value)}><option value="">{tr("Chosen automatically")}</option>{modelList.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      </div>
      <label><span className="labelLine">{tr("About you")} <span className="optional">{tr("optional")}</span></span><textarea rows={3} value={f.about} onChange={(e) => set("about", e.target.value)} maxLength={1500} placeholder={tr("What would help the AI to know about you: interests, projects, level of experience.")} /></label>
      <p className="settingsHelp">{tr("{brand} uses this only to answer you better; you can see and change it here any time.",{brand:BRAND_NAME})}</p>
    </section>
    <div className="formActions stickySave"><button className="primary" disabled={!!busy || !dirty}>{busy === "save" ? tr("Saving…") : tr("Save profile")}</button></div>
    {onPreferences && <section className="setSection"><h3>{tr("Memory and chats")}</h3><PreferenceSwitches preferences={preferences} onChange={onPreferences} busyKey={prefBusy} /></section>}
  </form>;
}

export function NotifyTab({ account, children }) {
  const { data, error, save } = account;
  useLanguage();
  if (error) return <div className="inlineError">{error}</div>;
  if (!data) return <div className="settingsLoading">{tr("Loading…")}</div>;
  const row = (k, title, desc) => <div className="prefRow" key={k}><div className="prefText"><b>{tr(title)}</b><span>{tr(desc)}</span></div>
    <Switch checked={data[k] !== false} label={tr(title)} onChange={(v) => save({ [k]: v }, "").catch((e) => toast(e.message))} /></div>;
  return <div>
    <h3>{tr("Notifications")}</h3>
    <div className="prefList">
      {row("notifyAutomations", "Automation results", "A message in the app (and on the phone, if it is subscribed) when an automation finishes.")}
      {row("notifyCredits", "Credit warnings", "A message at 25, 50, 75 and 90% of the week's credits. The 100% message always appears.")}
    </div>
    {children}
  </div>;
}

export function PrivacyTab({ account, onDataDeleted }) {
  const { data, error, save } = account;
  useLanguage();
  const [busy, setBusy] = useState("");
  if (error) return <div className="inlineError">{error}</div>;
  if (!data) return <div className="settingsLoading">{tr("Loading…")}</div>;
  async function exportData() {
    setBusy("export");
    try {
      const r = await fetch(`${GATEWAY}/api/me/export`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await saveBlobDownload(await r.blob(), `data-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) { toast(tr("The export failed:") + " " + e.message); } finally { setBusy(""); }
  }
  async function wipe(scope, label) {
    const word = prompt(tr("Delete {what}? This cannot be undone. Type DELETE to confirm.", { what: tr(label) }));
    if (word === null) return;
    setBusy(scope);
    try { await api("/api/me/delete-data", { method: "POST", body: JSON.stringify({ scope, confirm: word }) }); toast(tr("Deleted: {what}.", { what: tr(label) }), "ok"); onDataDeleted?.(scope); }
    catch (e) { toast(e.message); } finally { setBusy(""); }
  }
  return <div>
    <h3>{tr("Privacy and data")}</h3>
    <label className="accountInline">{tr("Keep chats")}<select value={data.retentionDays} onChange={(e) => save({ retentionDays: Number(e.target.value) }, tr("Saved.")).catch((er) => toast(er.message))}>{KEEP.map(([d, l]) => <option key={d} value={d}>{tr(l)}</option>)}</select></label>
    <p className="settingsHelp">{tr("Chats older than this are deleted on their own (pinned ones stay). Your data stays on the {brand} server and is never sold or used for ads.",{brand:BRAND_NAME})}</p>
    <div className="accountActions">
      <button className="secondary" onClick={exportData} disabled={!!busy}><Download size={15} /> {busy === "export" ? tr("Preparing…") : tr("Download all my data")}</button>
    </div>
    <h4>{tr("Delete data")}</h4>
    <div className="accountActions">
      <button className="secondary" onClick={() => wipe("conversations", "all chats")} disabled={!!busy}><Trash2 size={15} /> {tr("Chats")}</button>
      <button className="secondary" onClick={() => wipe("memories", "all memory")} disabled={!!busy}><Trash2 size={15} /> {tr("Memory")}</button>
      <button className="secondary" onClick={() => wipe("library", "all files in the Library")} disabled={!!busy}><Trash2 size={15} /> {tr("Files")}</button>
      <button className="iconDanger wide" onClick={() => wipe("all", "all the account's data (chats, memory, files, projects, assistants, skills, automations, apps, designs)")} disabled={!!busy}><Trash2 size={15} /> {tr("All data")}</button>
    </div>
  </div>;
}

const deviceLabel = (ua = "") => /iphone|ipad|android|mobile/i.test(ua) ? tr("Phone") : /electron/i.test(ua) ? tr("Windows app") : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : tr("Device");
const browserLabel = (ua = "") => /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox\//i.test(ua) ? "Firefox" : /safari\//i.test(ua) ? "Safari" : "";

const when = (v, lang) => v ? new Date(v).toLocaleString(lang, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
function ago(v, lang) {
  if (!v) return "—";
  const min = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (min < 1) return tr("now");
  if (min < 60) return rtf.format(-min, "minute");
  if (min < 1440) return rtf.format(-Math.round(min / 60), "hour");
  if (min < 43200) return rtf.format(-Math.round(min / 1440), "day");
  return when(v, lang);
}
// 0.7.35: «Account», in the shape of the Claude settings: sign out everywhere, delete the account, the account ID,
// the active sessions (device, address, created, last active) and the password.
export function SecurityTab({ account, onAccountDeleted, onLogoutAll }) {
  const { data } = account;
  const lang = useLanguage();
  const [sessions, setSessions] = useState(null), [local, setLocal] = useState(false), [pw, setPw] = useState({ current: "", next: "", again: "" }), [busy, setBusy] = useState(""), [copied, setCopied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const load = () => api("/api/me/sessions").then((d) => { if (mounted.current) { setSessions(d.data || []); setLocal(!!d.local); } }).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);
  const keepToken = (d) => { if (d?.token) storage.set(TOKEN_KEY, d.token); };
  async function revoke(id) { setBusy(id); try { await api(`/api/me/sessions/${id}`, { method: "DELETE" }); await load(); } catch (e) { toast(e.message); } finally { setBusy(""); } }
  async function revokeOthers() {
    setBusy("others");
    try { const d = await api("/api/me/sessions/revoke-others", { method: "POST", body: "{}" }); keepToken(d); toast(tr("The other devices were signed out."), "ok"); await load(); }
    catch (e) { toast(e.message); } finally { setBusy(""); }
  }
  async function logoutAll() {
    if (!confirm(tr("Sign out of {brand} on every device, this one included?", { brand: BRAND_NAME }))) return;
    setBusy("all");
    try { await api("/api/me/sessions/revoke-others", { method: "POST", body: "{}" }); onLogoutAll?.(); }
    catch (e) { toast(e.message); setBusy(""); }
  }
  async function changePassword(e) {
    e.preventDefault();
    if (pw.next.length < 8) { toast(tr("The new password needs at least 8 characters.")); return; }
    if (pw.next !== pw.again) { toast(tr("The two new passwords are not the same.")); return; }
    setBusy("pw");
    try { const d = await api("/api/me/password", { method: "POST", body: JSON.stringify({ current: pw.current, next: pw.next }) }); keepToken(d); setPw({ current: "", next: "", again: "" }); toast(tr("Password changed. The other devices have to sign in again."), "ok"); load(); }
    catch (er) { toast(er.message); } finally { setBusy(""); }
  }
  async function deleteAccount() {
    const password = prompt(tr("Delete the account and all its data? This cannot be undone. Type the account's password to confirm."));
    if (!password) return;
    setBusy("delete");
    try { await api("/api/me", { method: "DELETE", body: JSON.stringify({ password }) }); toast(tr("Account deleted."), "ok"); onAccountDeleted?.(); }
    catch (e) { toast(e.message); } finally { setBusy(""); }
  }
  async function copyId() { if (await writeClipboardText(data?.accountId || "")) { setCopied(true); setTimeout(() => mounted.current && setCopied(false), 1500); } }
  return <div className="settingsSections">
    <section className="setSection">
      <h3>{tr("Account")}</h3>
      <div className="setRow">
        <div className="setRowText"><b>{tr("Log out of all devices")}</b><span>{tr("Ends every session of this account, on this device too.")}</span></div>
        <button className="secondary" onClick={logoutAll} disabled={!!busy}><LogOut size={15} /> {busy === "all" ? tr("Signing out…") : tr("Log out")}</button>
      </div>
      <div className="setRow">
        <div className="setRowText"><b>{tr("Delete account")}</b><span>{data?.role === "owner" ? tr("The Owner account cannot be deleted.") : tr("The account and all its data (chats, memory, files, settings) are deleted for good.")}</span></div>
        {data?.role !== "owner" && <button className="iconDanger" onClick={deleteAccount} disabled={!!busy}><Trash2 size={15} /> {busy === "delete" ? tr("Deleting…") : tr("Delete account")}</button>}
      </div>
      {data?.accountId && <div className="setRow">
        <div className="setRowText"><b>{tr("Account ID")}</b><code className="accountId">{data.accountId}</code></div>
        <button className="secondary" onClick={copyId} aria-label={tr("Copy the account ID")}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? tr("Copied") : tr("Copy")}</button>
      </div>}
    </section>
    <section className="setSection">
      <h3>{tr("Active sessions")}</h3>
      {!sessions ? <div className="settingsLoading">{tr("Loading…")}</div> : <div className="sessionTableWrap"><table className="sessionTable">
        <thead><tr><th>{tr("Device")}</th><th>{tr("IP address")}</th><th>{tr("Created")}</th><th>{tr("Last active")}</th><th aria-label={tr("Actions")} /></tr></thead>
        <tbody>{sessions.map((s) => <tr key={s.id} className={cx(s.current && "current")}>
          <td><span className="sessionDevice">{/iphone|android|mobile/i.test(s.userAgent) ? <Smartphone size={16} /> : <Monitor size={16} />}<span><b>{browserLabel(s.userAgent) ? `${browserLabel(s.userAgent)} (${deviceLabel(s.userAgent)})` : deviceLabel(s.userAgent)}</b>{s.current && <span className="sessionNow">{tr("Current")}</span>}</span></span></td>
          <td>{s.ip || "—"}</td>
          <td>{when(s.createdAt, lang)}</td>
          <td>{s.current ? tr("now") : ago(s.lastSeenAt || s.createdAt, lang)}</td>
          <td>{!s.current && !local && <button className="smallBtn" onClick={() => revoke(s.id)} disabled={!!busy}><LogOut size={13} /> {tr("Sign out")}</button>}</td>
        </tr>)}</tbody>
      </table></div>}
      {sessions && sessions.length > 1 && <div className="accountActions"><button className="secondary" onClick={revokeOthers} disabled={!!busy}><LogOut size={15} /> {busy === "others" ? tr("Signing out…") : tr("Sign out the other devices")}</button></div>}
    </section>
    <section className="setSection">
      <h3>{tr("Password")}</h3>
      <form className="accountGrid" onSubmit={changePassword}>
        <label>{tr("Current password")}<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></label>
        <span />
        <label>{tr("New password")}<input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} minLength={8} required /></label>
        <label>{tr("Again")}<input type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} minLength={8} required /></label>
        <div className="formActions span2"><button className="secondary" disabled={busy === "pw"}><KeyRound size={15} /> {busy === "pw" ? tr("Changing…") : tr("Change password")}</button></div>
      </form>
    </section>
  </div>;
}
