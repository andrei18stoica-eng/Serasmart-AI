import React, { useState } from "react";
import { Plug, Puzzle, Sparkles } from "lucide-react";
import { cx, ToolShell, useAccess, deniedMessage } from "../core.jsx";
import { t as tr, useLanguage } from "../i18n.jsx";
import { ConnectorsPanel } from "./Connectors.jsx";
import { PluginsPanel } from "./Plugins.jsx";
import { SkillsPanel } from "./Skills.jsx";

// 0.7.30, asked by the Owner: connectors, plugins and skills in one place, «Extensions» in the tools menu.
const TABS = [
  ["connectors", Plug, "Connectors", "plugins", "Connect your apps: the AI can search, read, create and edit in them, and asks you before every action."],
  ["plugins", Puzzle, "Plugins", "plugins", "Your own APIs and webhooks, and plugins that work right away."],
  ["skills", Sparkles, "Skills", null, "Instructions the AI follows when you call them with /name."],
];

export function ExtensionsPage({ onClose, initialTab }) {
  useLanguage();
  const { can } = useAccess();
  const allowed = TABS.filter(([, , , perm]) => !perm || can(perm));
  const [tab, setTab] = useState(() => (allowed.find((x) => x[0] === initialTab) || allowed[0])[0]);
  const current = TABS.find((x) => x[0] === tab);
  return <ToolShell title={tr("Extensions")} subtitle={tr(current[4])} onClose={onClose} className="pageModal pluginsPage extensionsPage">
    <div className="extSwitch" role="tablist" aria-label={tr("Extensions")}>
      {TABS.map(([key, Icon, label, perm]) => {
        const ok = !perm || can(perm);
        return <button key={key} role="tab" aria-selected={tab === key} disabled={!ok} title={ok ? undefined : deniedMessage(perm)} className={cx("extTab", tab === key && "active")} onClick={() => setTab(key)}><Icon size={15} /> {tr(label)}</button>;
      })}
    </div>
    {tab === "connectors" && <div className="pageBody"><ConnectorsPanel /></div>}
    {tab === "plugins" && <PluginsPanel />}
    {tab === "skills" && <SkillsPanel />}
  </ToolShell>;
}
