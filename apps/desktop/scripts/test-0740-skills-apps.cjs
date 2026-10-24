"use strict";
// 0.7.40: skills chosen on their own (no fixed number) and app routing (only the apps a request needs, the named app
// never swapped, actions by risk, an audit log without values).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { routeApps, toolRisk, rankTools } = require("../lib/approuter.cjs");
const { chooseSkills } = require("../lib/skillselect.cjs");
const { createAppAudit } = require("../lib/appaudit.cjs");
const { validateSkill, MAX_ACTIVE } = require("../lib/skills.cjs");

function expect(v, m) { if (!v) throw new Error(m); }
const names = (r) => r.selected.map((x) => x.name).join();
const msg = (t, before = []) => [...before.map((c) => ({ role: "user", content: c })), { role: "user", content: t }];

// --- App routing ---
const apps = [
  { id: "n", catalogId: "notion", name: "Notion", status: "connected" },
  { id: "g", catalogId: "gmail", name: "Gmail", status: "connected" },
  { id: "d", catalogId: "gdrive", name: "Google Drive", status: "connected" },
  { id: "c", catalogId: "gcalendar", name: "Google Calendar", status: "connected" }
];
// The bug the Owner hit: Google Calendar, connected last, fell past the tool limit and Notion's calendar was used.
expect(names(routeApps(apps, msg("poti sa imi pui azi in calendar la ora 18 sa fac bagaj"))) === "Google Calendar", "a calendar request gets Google Calendar only");
expect(names(routeApps(apps, msg("foloseste google calendar aplicatia conectata nu notion"))) === "Google Calendar", "«not Notion» leaves Notion out");
expect(names(routeApps(apps, msg("2 ore", ["pune in calendar maine la 18"]))) === "Google Calendar", "a short follow-up keeps the app of the request");
expect(!routeApps(apps, msg("explica-mi teoria relativitatii")).selected.length, "a message that needs no app gets none");
expect(/Gmail/.test(names(routeApps(apps, msg("citeste ultimele emailuri din inbox")))), "an email request gets Gmail");
expect(names(routeApps(apps, msg("fa o pagina in Notion cu planul"))) === "Notion", "a named app is chosen");
// The named app needs a new sign-in: reported, and no other calendar stands in.
let r = routeApps([apps[0], { ...apps[3], status: "signin" }], msg("pune in google calendar maine la 9"));
expect(!r.selected.length && r.missing[0].name === "Google Calendar" && r.missing[0].status === "signin", "a named app that needs a sign-in is reported: " + JSON.stringify(r));
// Named but never connected.
r = routeApps([apps[0]], msg("adauga in Google Calendar o intalnire vineri la 10"), require("../lib/connectors.cjs").CATALOG);
expect(!r.selected.length && r.missing.some((m) => m.name === "Google Calendar" && m.status === "not connected"), "a named app that is not connected is reported: " + JSON.stringify(r));
// Modes.
expect(!routeApps([{ ...apps[3], mode: "disabled" }], msg("pune in calendar la 18")).selected.length, "Disabled is never used");
expect(names(routeApps([{ ...apps[0], mode: "always" }], msg("salut"))) === "Notion", "Always available is in every message");
// Custom apps: by the words of their tools.
expect(routeApps([{ id: "x", catalogId: "", name: "Notes", status: "connected", toolNames: ["create_note", "search_notes"] }], msg("make a note called Hello")).selected.length === 1, "a custom app by its tools");
expect(!routeApps([{ id: "x", catalogId: "", name: "Notes", status: "connected", toolNames: ["create_note"] }], msg("what is 2+2")).selected.length, "a custom app is left out when not needed");
// Reasons are kept for the log.
expect(routeApps(apps, msg("pune in calendar la 18")).log.selected[0].reasons.length > 0, "the choice has reasons");

// --- Risk of each tool ---
const risk = { list_events: 0, get_event: 0, suggest_time: 0, search_threads: 0, create_event: 1, update_event: 1, respond_to_event: 1, create_draft: 1,
  delete_event: 2, send_message: 2, trash_message: 2, share_file: 2, create_refund: 2, delete_repository: 3, get_api_key: 3, delete_workspace: 3 };
for (const [n, v] of Object.entries(risk)) expect(toolRisk(n) === v, `${n} is risk ${v}, got ${toolRisk(n)}`);
expect(toolRisk("whatever", true) === 0 && toolRisk("whatever") === 1, "unknown tools ask, unless the app says read only");
expect(rankTools([{ name: "a", title: "", description: "pages" }, { name: "create_event", title: "", description: "calendar event" }], "add an event", 1)[0].name === "create_event", "the tools that fit the message come first");

// --- Skills ---
expect(MAX_ACTIVE === null, "no cap on the skills of one message");
const skills = [
  { slug: "powerpoint", name: "PowerPoint", description: "Slide decks and presentations as a real PPTX file", instructions: "P".repeat(100) },
  { slug: "excel", name: "Excel", description: "Spreadsheets with live formulas, budgets and tables", instructions: "E" },
  { slug: "email", name: "Email writer", description: "Clear, polite emails with a subject line", instructions: "M", triggers: ["mail catre"] },
  { slug: "tone", name: "Tone", description: "Keeps a friendly tone", instructions: "T", auto: true },
  { slug: "off", name: "Off", description: "Presentations", instructions: "O", enabled: false },
  { slug: "pitch", name: "Pitch deck", description: "Investor pitch deck presentations", instructions: "D", requires: ["powerpoint"], conflicts: ["excel"], excludes: ["fara pitch"] }
];
const pick = (t, more) => chooseSkills(skills, t, more).list.map((s) => s.slug).sort().join();
expect(pick("fa o prezentare powerpoint despre soare") === "powerpoint,tone", "a presentation request: " + pick("fa o prezentare powerpoint despre soare"));
expect(pick("scrie un mail catre client") === "email,tone", "a trigger phrase picks a skill: " + pick("scrie un mail catre client"));
expect(pick("salut") === "tone", "always on, and nothing else for a greeting");
expect(!pick("presentations").includes("off"), "a disabled skill is never chosen");
expect(pick("investor pitch deck presentation") === "pitch,powerpoint,tone", "a needed skill comes along: " + pick("investor pitch deck presentation"));
expect(!pick("investor pitch deck, fara pitch").includes("pitch"), "a word that rules a skill out");
expect(pick("/excel investor pitch deck presentation").includes("excel") && !pick("/excel investor pitch deck presentation").includes("pitch"), "clashing skills: the called one stays");
expect(pick("mai multe slide-uri", { previous: "fa o prezentare powerpoint" }).includes("powerpoint"), "the message before counts too");
const many = Array.from({ length: 40 }, (_, i) => ({ slug: `deck${i}`, name: `Deck ${i}`, description: "presentation slides deck", instructions: "x" }));
expect(chooseSkills(many, "presentation slides deck").list.length === 40, "no fixed number: every skill that fits is chosen");
expect(chooseSkills(skills, "fa o prezentare powerpoint").log.every((x) => x.reasons.length), "every chosen skill says why");
expect(validateSkill({ name: "A", instructions: "B", triggers: "x, y", priority: 3 }).value.triggers.join() === "x,y", "triggers are saved");
expect(validateSkill({ name: "A", instructions: "B", priority: 99 }).error, "the priority is checked");

// --- Audit ---
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "serasmart-audit-"));
const audit = createAppAudit(dir);
audit.record("u1", { kind: "action", app: "Google Calendar", tool: "create_event", risk: "change", decision: "once", outcome: "done", args: { summary: "Secret plan", startTime: "x" } });
const row = audit.list("u1")[0];
expect(row.fields.join() === "summary,startTime" && !JSON.stringify(row).includes("Secret plan"), "the log keeps field names, never values");
expect(!audit.list("u2").length, "one account's log is its own");
audit.remove("u1"); expect(!audit.list("u1").length, "deleted with the account");
audit.flush();

// --- Gateway and screens ---
const gw = fs.readFileSync(path.join(__dirname, "..", "local-gateway.cjs"), "utf8");
expect(/appRouter\.routeApps\(conns,messages/.test(gw) && /enabled:decided\.selected\.map/.test(gw), "the chat gets only the chosen apps");
expect(/risk>=3/.test(gw) && /risk>=2\|\|\(risk===1&&!connectors\.alwaysAllowed/.test(gw) && /decision="auto"/.test(gw), "actions by risk");
expect(/decision==="always"&&!\(ask\.risk>=2\)/.test(gw), "«Always allow» does not stick for risky actions");
expect(/APP_CALLS_MAX=25,APP_CHANGES_MAX=10/.test(gw), "limits per request");
expect(/data, not instructions/.test(gw) && /only when the tool's own result confirms it/.test(gw), "tool results are data; success only when confirmed");
expect(/app\.patch\("\/api\/connectors\/:id"/.test(gw) && /\/api\/connectors\/audit/.test(gw), "modes and the audit log have routes");
expect(/missingAppsText/.test(gw) && /Extensions → Connectors → \$\{missing\[0\]\.name\}/.test(gw), "a named app that is missing is reported");
expect(/skillsChosen\(/.test(gw) && /usage\.skills/.test(gw), "skills are chosen and reported");
const ui = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "pages", "Connectors.jsx"), "utf8");
expect(/Always available/.test(ui) && /!\(run\.risk >= 2\)/.test(ui), "app modes and no «Always allow» for risky actions");
const sk = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "pages", "Skills.jsx"), "utf8");
expect(/value="always"/.test(sk) && /value="disabled"/.test(sk) && /Trigger words/.test(sk), "skill states and trigger words");
const main = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "main.jsx"), "utf8");
expect(/tr\("Skills used"\)/.test(main), "the person sees the skills used");

console.log("0.7.40 skills and app routing OK");
