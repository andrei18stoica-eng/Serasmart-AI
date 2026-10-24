"use strict";
// 0.7.40 — App routing (asked by the Owner: "only the apps the request needs, the app I name is never swapped for
// another, risky actions always ask"). Before, every connected app's tools went to the AI (at most 60, in the order
// the apps were connected): with Notion, Gmail and Drive connected first, a Google Calendar connected later fell past
// the limit, the AI only saw Notion's calendar and used it in its place.
//
// What this file decides, from the message and the last messages of the conversation (only names, descriptions and
// keywords: no app is called to decide):
//   - which connected apps the AI gets, with a score and the reasons (mode Disabled / Auto / Always available);
//   - an app the person names explicitly always wins, and the other apps of the same kind are left out;
//   - an app the person names that is not connected (or needs a new sign-in) is reported, never replaced;
//   - how risky each tool is: 0 read (runs on its own), 1 create / change (asks, «Always allow» possible),
//     2 send / delete / pay / permissions (asks every time), 3 not allowed in Serasmart.

const MODES = ["disabled", "auto", "always"];
const SCORE_MIN = 20;
// Tool-name words that say nothing about what an app is for.
const GENERIC = new Set(["create", "update", "delete", "search", "list", "fetch", "read", "write", "items", "item", "info", "data", "with", "from", "your", "that", "this", "tool", "tools", "query", "find", "make", "edit", "remove"]);

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ţ]/g, "t").replace(/[ş]/g, "s");

// The names people use for each app (folded: no diacritics, lower case). A name here makes the app «explicit».
const APP_NAMES = {
  gcalendar: ["google calendar", "calendarul google", "calendar google", "google calendarul", "gcal", "calendarul meu google"],
  gmail: ["gmail", "g mail", "google mail"],
  gdrive: ["google drive", "drive-ul", "driveul", "gdrive", "drive google"],
  gdocs: ["google docs", "google doc", "documentul google", "gdocs"],
  gsheets: ["google sheets", "google sheet", "foaia google", "gsheets"],
  notion: ["notion"], linear: ["linear"], atlassian: ["jira", "confluence"], asana: ["asana"], monday: ["monday"],
  canva: ["canva"], miro: ["miro"], box: ["box.com", "in box", "din box"], webflow: ["webflow"], wix: ["wix"],
  close: ["close crm"], stripe: ["stripe"], paypal: ["paypal"], sentry: ["sentry"], netlify: ["netlify"],
  github: ["github", "git hub"], fireflies: ["fireflies"], deepwiki: ["deepwiki"], airtable: ["airtable"],
  clickup: ["clickup", "click up"], todoist: ["todoist"], granola: ["granola"], zapier: ["zapier"], supabase: ["supabase"],
  neon: ["neon"], prisma: ["prisma"], cfbindings: ["cloudflare"], cfobservability: ["cloudflare logs"], cfdocs: ["cloudflare docs"],
  semgrep: ["semgrep"], jam: ["jam.dev"], datadog: ["datadog"], posthog: ["posthog"], huggingface: ["hugging face", "huggingface"],
  replicate: ["replicate"], exa: ["exa"], context7: ["context7"], lovable: ["lovable"], hubspot: ["hubspot"],
  browserbase: ["browserbase"], cloudinary: ["cloudinary"], egnyte: ["egnyte"], klaviyo: ["klaviyo"], ramp: ["ramp"],
  mercury: ["mercury"], plaid: ["plaid"]
};

// What kind of thing each app is. Two apps of the same kind never stand in for each other.
const APP_KIND = {
  gcalendar: "calendar", gmail: "email", gdrive: "files", box: "files", egnyte: "files", cloudinary: "files",
  gdocs: "docs", gsheets: "sheets", airtable: "sheets", notion: "notes", todoist: "tasks", asana: "tasks", clickup: "tasks",
  monday: "tasks", linear: "issues", atlassian: "issues", github: "code", deepwiki: "code", sentry: "code", netlify: "deploy",
  canva: "design", miro: "design", webflow: "website", wix: "website", stripe: "payments", paypal: "payments", ramp: "payments",
  mercury: "payments", plaid: "payments", hubspot: "crm", close: "crm", klaviyo: "crm", fireflies: "meetings", granola: "meetings",
  supabase: "database", neon: "database", prisma: "database", exa: "search", context7: "search", browserbase: "search"
};

// Words that point to a kind of app (folded). A RegExp is matched as is.
const KIND_WORDS = {
  calendar: ["calendar", "eveniment", "evenimentul", "event", "meeting", "intalnire", "programare", "programeaz", "programez", "schedule",
    "agenda", "reminder", "aminteste-mi", "remind me", "rezerva timp", "disponibil", "free time", "liber maine", "ocupat",
    "azi la", "maine la", "poimaine", "luni", "marti", "miercuri", "joi", "vineri", "sambata", "duminica",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "tomorrow", "today at",
    /\bla (ora )?\d{1,2}([:.]\d{2})?\b/, /\bat \d{1,2}(:\d{2})? ?(am|pm)?\b/, /\b\d{1,2}[:.]\d{2}\b/],
  email: ["email", "e-mail", "mail", "mesaje", "inbox", "casuta", "trimite-i", "raspunde-i", "draft", "ciorna", "newsletter", "expeditor", "sender"],
  files: ["fisier", "fisierul", "fisiere", "folder", "dosar", "file", "files", "upload", "incarca", "pdf din", "document din drive"],
  docs: ["document", "doc", "docs", "documentul", "write a doc", "scrie un document"],
  sheets: ["tabel", "spreadsheet", "sheet", "foaie de calcul", "coloana", "rand ", "celula", "buget", "excel online"],
  notes: ["pagina", "pagini", "notite", "note ", "wiki", "baza de date", "database", "workspace"],
  tasks: ["task", "taskuri", "sarcin", "to-do", "todo", "de facut", "lista de facut", "proiect", "termen"],
  issues: ["issue", "ticket", "tichet", "bug", "sprint", "epic"],
  code: ["repo", "repository", "pull request", "commit", "cod", "branch", "issue pe github"],
  deploy: ["deploy", "site-ul", "publica site"],
  design: ["design", "poster", "prezentare in canva", "whiteboard", "tabla"],
  website: ["site", "website", "pagina web", "cms"],
  payments: ["plata", "plati", "factur", "invoice", "refund", "abonament client", "tranzact", "payment"],
  crm: ["client", "clienti", "lead", "contact", "deal", "oportunitat", "campanie"],
  meetings: ["transcript", "inregistrarea sedintei", "rezumatul intalnirii", "meeting notes"],
  database: ["sql", "tabela", "query", "migrare", "migration", "postgres"],
  search: ["cauta pe net", "documentatie", "search the web"]
};

function wordsIn(text, list) {
  const hits = [];
  for (const w of list) {
    if (w instanceof RegExp) { if (w.test(text)) hits.push(String(w)); }
    else if (text.includes(w)) hits.push(w);
  }
  return hits;
}
const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NOT = "(?:nu|not|no|fara|without|in loc de|instead of|nu prin|nu in|nu cu|not in|not with)";
function namesOf(id, name) { return [...(APP_NAMES[id] || []), fold(name)].filter((n) => n && n.length >= 3); }
// Named, and not only in «not Notion» / «în loc de Notion».
function namedIn(text, id, name) {
  return namesOf(id, name).some((n) => {
    const all = text.match(new RegExp(`(^|[^a-z0-9])${esc(n)}(?=[^a-z0-9]|$)`, "g")) || [];
    const negated = text.match(new RegExp(`${NOT}\\s+(?:(?:pe|cu|in|din|aplicatia|app)\\s+)?${esc(n)}(?=[^a-z0-9]|$)`, "g")) || [];
    return all.length > negated.length;
  });
}
function negatedIn(text, id, name) {
  return namesOf(id, name).some((n) => new RegExp(`${NOT}\\s+(?:(?:pe|cu|in|din|aplicatia|app)\\s+)?${esc(n)}(?=[^a-z0-9]|$)`).test(text));
}
// The text of the person's messages: the last one and a few before it.
function userTexts(messages) {
  const out = [];
  for (const m of Array.isArray(messages) ? messages : []) {
    if (m?.role !== "user") continue;
    const c = typeof m.content === "string" ? m.content : Array.isArray(m.content) ? m.content.map((p) => (p?.type === "text" ? p.text : "")).join(" ") : "";
    out.push(fold(c).slice(0, 4000));
  }
  return { current: out[out.length - 1] || "", recent: out.slice(-6, -1).join(" \n ") };
}

/**
 * Chooses the apps for one message.
 * @param {Array} conns the person's connectors (any status), each { id, catalogId, name, status, mode }
 * @param {Array} messages the conversation (OpenAI shape)
 * @returns {{ selected: Array<{id,name,kind,score,explicit,reasons}>, missing: Array<{name,status}>, log: object }}
 */
function routeApps(conns, messages, catalog = []) {
  const { current, recent } = userTexts(messages);
  const scored = [], missing = [];
  for (const c of conns || []) {
    const id = c.catalogId || "", kind = APP_KIND[id] || "custom", mode = MODES.includes(c.mode) ? c.mode : "auto";
    const named = namedIn(current, id, c.name), namedBefore = !named && namedIn(recent, id, c.name);
    if (c.status !== "connected") { if (named) missing.push({ name: c.name, status: c.status || "pending" }); continue; }
    if (mode === "disabled") continue;
    if (negatedIn(current, id, c.name) && !named) continue; // «not Notion»
    const reasons = []; let score = 0;
    if (mode === "always") { score += 100; reasons.push("always available"); }
    if (named) { score += 1000; reasons.push("named in the message"); }
    if (namedBefore) { score += 300; reasons.push("named earlier in the conversation"); }
    const kw = KIND_WORDS[kind] || [];
    const now = wordsIn(current, kw), before = now.length ? [] : wordsIn(recent, kw);
    if (now.length) { score += 40 + 10 * Math.min(now.length - 1, 3); reasons.push(`asks for a ${kind}: ${now.slice(0, 3).join(", ")}`); }
    else if (before.length) { score += 20; reasons.push(`the conversation is about a ${kind}`); }
    // Custom apps (an MCP address): the words of their description and of their tools' names (create_note → note).
    if (kind === "custom" && !named) {
      const vocab = new Set(fold(`${c.description || ""} ${(c.toolNames || []).join(" ")}`).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w)).map((w) => w.replace(/(es|s)$/, "")));
      const hit = [...vocab].filter((w) => w.length >= 3 && new RegExp(`(^|[^a-z0-9])${w}`).test(current));
      if (hit.length) { score += 25 * Math.min(hit.length, 3); reasons.push(`matches its tools: ${hit.slice(0, 3).join(", ")}`); }
    }
    if (score >= SCORE_MIN) scored.push({ id: c.id, catalogId: id, name: c.name, kind, score, explicit: named || namedBefore, reasons });
  }
  // An app named in the message is never swapped: the other apps of its kind are left out.
  const explicitKinds = new Set(scored.filter((s) => s.explicit).map((s) => s.kind));
  let selected = scored.filter((s) => s.explicit || !explicitKinds.has(s.kind) || s.kind === "custom");
  // Apps named but not connected at all (in the catalog, never connected).
  for (const e of catalog) {
    if ((conns || []).some((c) => c.catalogId === e.id)) continue;
    if (namedIn(current, e.id, e.name)) {
      missing.push({ name: e.name, status: "not connected" });
      // The kind the person asked for is not there: no other app stands in for it.
      selected = selected.filter((s) => s.kind !== (APP_KIND[e.id] || "-") || s.explicit);
    }
  }
  selected.sort((a, b) => b.score - a.score);
  return { selected, missing, log: { at: new Date().toISOString(), selected: selected.map(({ name, score, reasons }) => ({ name, score, reasons })), missing } };
}

// How risky a tool is, from its name (and the app's «read only» hint).
const FORBIDDEN = /(^|_)(delete|remove|destroy|drop)_?(account|repo|repository|workspace|organi[sz]ation|org|team|database|project|user|member)s?($|_)|(create|get|reveal|show|rotate|export|list)_?(api_?keys?|secrets?|tokens?|passwords?|credentials?)|(^|_)(update|change|set|disable)_?(security|sso|mfa|2fa|password|billing_account)|drop_database|delete_all|bulk_delete|empty_trash/;
const CONFIRM = /(^|_)(send|reply|forward|share|invite|publish|post|tweet|transfer|pay|payout|refund|charge|purchase|buy|order|delete|remove|trash|destroy|archive|cancel|revoke|grant|unshare|merge|deploy|rollback|execute|run_sql|apply_migration|permission|permissions|spam)($|_|s($|_))/;
const WRITE = /(^|_)(create|add|update|edit|insert|append|set|move|rename|copy|duplicate|upload|write|draft|comment|label|unlabel|mark|unmark|respond|schedule|reschedule|complete|close|reopen|assign|tag|import|generate|resize|untrash)($|_)/;
const READ = /(^|_)(get|list|search|read|fetch|find|query|view|describe|show|suggest|whoami|download|lookup|check|count|preview|analy[sz]e|summari[sz]e|explain|resolve|health)($|_)/;
function toolRisk(name, readOnly = false) {
  const n = String(name || "").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (FORBIDDEN.test(n)) return 3;
  if (CONFIRM.test(n)) return 2;
  if (WRITE.test(n)) return 1;
  if (readOnly || READ.test(n)) return 0;
  return 1;
}
const RISK_NAMES = ["read", "change", "confirm", "blocked"];

// The tools of one app that fit the message best, when there is room for only some of them.
function rankTools(list, text, room) {
  if (list.length <= room) return list;
  const words = fold(text).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const score = (t) => { const hay = fold(`${t.name} ${t.title} ${t.description}`); return words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0), 0); };
  return list.map((t, i) => ({ t, i, s: score(t) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, room).map((x) => x.t);
}

module.exports = { routeApps, namedIn, negatedIn, toolRisk, rankTools, userTexts, fold, MODES, RISK_NAMES, APP_KIND, SCORE_MIN };
