import React, { useEffect, useState } from "react";
import { SquareTerminal, GitBranch, Sparkles, ShieldCheck } from "lucide-react";
import { api, toast, ToolShell } from "../core.jsx";
import { BRAND_NAME } from "../brand.js";
import { t as tr, useLanguage } from "../i18n.jsx";

// "Code Serasmart AI": start a programming conversation with Codex or Claude Code. The Owner uses the subscriptions
// connected in OmniRoute; an account the Owner gave access to (Control Center → "Code Serasmart AI") uses the paid APIs.
const GROUPS = [
  ["codex", "Codex", "Your ChatGPT subscription, connected in OmniRoute"],
  ["claude-code", "Claude Code", "Your Claude subscription, connected in OmniRoute"],
  ["openai-api", "OpenAI through the API", "Paid per use, with the key or the permissions the Owner gave"],
  ["claude-api", "Claude through the API", "Paid per use, with the permissions the Owner gave"]
];
const short = (id) => String(id).split("/").slice(1).join("/") || id;

export function CodePage({ onClose, onStart }) {
  useLanguage();
  const [info, setInfo] = useState(null), [busy, setBusy] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/api/code").then((d) => { if (active) setInfo(d.data || { allowed: false }); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  async function start(model) {
    if (busy) return;
    setBusy(model);
    try { const d = await api("/api/code/session", { method: "POST", body: JSON.stringify({ model }) }); onStart(d.data, d.assistant); }
    catch (e) { toast("Code: " + e.message); }
    finally { setBusy(""); }
  }
  const models = info?.models || [];
  return <ToolShell title={`Code ${BRAND_NAME}`} subtitle={tr("Programming with Codex and Claude Code: pick the model and start a coding conversation.")} onClose={onClose} className="pageModal codePage">
    <div className="pageBody">
      {error && <div className="inlineError" role="alert">{error}</div>}
      {!info && !error && <div className="emptyState"><SquareTerminal size={30}/>{tr("Loading the coding models…")}</div>}
      {info && !info.allowed && <div className="emptyState"><ShieldCheck size={30}/>{tr("Code {brand} is available to the Owner and to the accounts the Owner gave access to.",{brand:BRAND_NAME})}</div>}
      {info?.allowed && <>
        {GROUPS.map(([key, title, note]) => {
          const list = models.filter((m) => m.group === key);
          if (!list.length && (key === "openai-api" || key === "claude-api")) return null;
          if (!list.length && !info.subscriptions) return null;
          return <section className="codeGroup" key={key}>
            <div className="codeGroupHead"><b>{tr(title)}</b><small>{tr(note)}</small></div>
            {list.length ? <div className="codeModels">{list.map((m) => <button key={m.id} type="button" className="codeModel" onClick={() => start(m.id)} disabled={!!busy}>
              <SquareTerminal size={16}/><span><b>{short(m.id)}</b><small>{m.id}</small></span><em>{busy === m.id ? tr("Starting…") : tr("Start")}</em>
            </button>)}</div> : <p className="settingsHelp">{tr("No {name} model in OmniRoute. Connect it in the OmniRoute panel (Providers), then open this page again.",{name:tr(title)})}</p>}
          </section>;
        })}
        {!models.length && <div className="emptyState"><Sparkles size={30}/>{tr("No coding model is available yet.")} {info.subscriptions ? tr("Connect Codex or Claude Code in OmniRoute.") : tr("Ask the Owner for access to the OpenAI or Claude models.")}</div>}
        <section className="codeGroup">
          <div className="codeGroupHead"><b><GitBranch size={14}/> GitHub</b><small>{info.repo ? `${info.repo} · ${info.branch}` : tr("No repository connected")}</small></div>
          <p className="settingsHelp">{info.repo ? tr("For coding questions, {brand} finds the relevant files in this repository by itself.",{brand:BRAND_NAME}) : tr("Add the repository in Settings → AI & OmniRoute → GitHub so {brand} reads the code by itself for programming questions.",{brand:BRAND_NAME})}</p>
        </section>
        {info.owner && <p className="settingsHelp codeAccessNote">{tr("Access for other accounts: Control Center → the account → «Code {brand}». They use the OpenAI / Claude APIs, paid per use, not your subscriptions: the ChatGPT and Claude terms do not allow sharing an account.",{brand:BRAND_NAME})}</p>}
      </>}
    </div>
  </ToolShell>;
}
