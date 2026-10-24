// 0.7.38, asked by the Owner: "Billing and Usage are the same thing. In Usage I want the consumption of each account —
// everyone sees their own, the Owner sees all of them — a button with the plan of every account, and Billing is the
// subscription." Also: "I cannot scroll in Settings to see everything."
const fs = require("fs"), http = require("http"), os = require("os"), path = require("path");
const U = require("../lib/usage.cjs");
function expect(v, m) { if (!v) throw new Error(m); }
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

function units() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-"));
  let now = Date.UTC(2026, 9, 20, 10, 0);
  const L = U.createUsage(dir, { now: () => now });
  L.record("ana", "chat", { model: "groq/llama", credits: 1 });
  L.record("ana", "chat", { model: "groq/llama", credits: 1 });
  L.record("ana", "image", { model: "gemini", credits: 20 });
  L.record("ana", "transcribe", { seconds: 90, credits: 6 });
  now += 86400000;
  L.record("ana", "video", { model: "veo", seconds: 8, credits: 424 });
  L.record("bob", "chat", { model: "x", credits: 10 });
  L.record("ana", "nonsense", {});
  const s = L.summary("ana", 7);
  expect(s.daily.length === 7 && s.totals.chat === 2 && s.totals.image === 1 && s.totals.video === 1 && s.totals.transcribe === 1 && s.totals.seconds === 90 && s.totals.credits === 452, "totals: " + JSON.stringify(s.totals));
  expect(s.daily[6].video === 1 && s.daily[5].chat === 2, "a row per day, oldest first");
  expect(s.models[0].model === "groq/llama" && s.models[0].count === 2 && s.recent[0].kind === "video", "models and recent events");
  expect(L.summary("bob", 7).totals.credits === 10 && L.summary("nobody", 30).totals.chat === 0, "accounts are kept apart");
  now += 200 * 86400000; L.record("ana", "chat", { credits: 1 });
  expect(L.summary("ana", 120).totals.chat === 1, "days older than KEEP_DAYS are dropped");
  L.remove("ana"); expect(L.summary("ana", 30).totals.chat === 0, "a deleted account's usage goes too");
  fs.rmSync(dir, { recursive: true, force: true });
}

async function gateway() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-gw-"));
  const omni = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => body += c); req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "Ai principal", owned_by: "combo" }, { id: "anthropic/claude-sonnet-4.5" }] }));
      if (req.url === "/v1/chat/completions") { const j = JSON.parse(body); return res.end(JSON.stringify({ id: "x", model: j.model, choices: [{ index: 0, message: { role: "assistant", content: "Gata." }, finish_reason: "stop" }] })); }
      res.statusCode = 404; res.end("{}");
    });
  });
  const omniPort = await listen(omni);
  // Credits are OFF (as on the site today): the usage is still counted.
  const cfg = { baseUrl: `http://127.0.0.1:${omniPort}/v1`, apiKey: "k", model: "Ai principal", webSearchEnabled: false, githubAutoContext: false, directChatEnabled: false, ownerEmail: "owner@example.com", creditsEnabled: false };
  const gw = require("../local-gateway.cjs").startLocalGateway({ dataDir: dir, port: 8889, host: "127.0.0.1", getOmniConfig: () => cfg });
  const base = "http://127.0.0.1:8889";
  const call = async (p, { method = "GET", body, token } = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    const owner = (await call("/auth/register", { method: "POST", body: { email: "owner@example.com", password: "password123", name: "Owner" } })).j.token;
    const ana = (await call("/auth/register", { method: "POST", body: { email: "ana@example.com", password: "password123", name: "Ana" } })).j.token;
    const chat = (token, model) => call("/api/chat", { method: "POST", token, body: { model, messages: [{ role: "user", content: "Salut" }] } });
    expect((await chat(ana, "anthropic/claude-sonnet-4.5")).status === 200 && (await chat(ana, "anthropic/claude-sonnet-4.5")).status === 200, "Ana answers");
    expect((await chat(owner, "anthropic/claude-sonnet-4.5")).status === 200, "the Owner answers");
    let r = await call("/api/usage?days=7", { token: ana });
    expect(r.status === 200 && r.j.totals.chat === 2 && r.j.totals.credits === 20 && r.j.daily.length === 7 && r.j.models[0].model === "anthropic/claude-sonnet-4.5", "Ana sees her own usage, credits off too: " + JSON.stringify(r.j).slice(0, 300));
    expect(r.j.creditsEnabled === false && r.j.plan === null, "and her plan (none)");
    expect((await call("/api/usage/accounts", { token: ana })).status === 403, "only the Owner sees every account");
    const ownerId = (await call("/api/usage", { token: owner })).j;
    expect(ownerId.totals.chat === 1, "the Owner's own usage is his");
    r = await call("/api/usage/accounts?days=30", { token: owner });
    const anaRow = r.j.data?.find((x) => x.email === "ana@example.com");
    expect(r.status === 200 && anaRow?.totals.chat === 2 && r.j.data.some((x) => x.email === "owner@example.com" && x.unlimited), "the Owner sees every account with its usage and plan: " + JSON.stringify(r.j).slice(0, 300));
    r = await call(`/api/usage/accounts/${anaRow.id}?days=7`, { token: owner });
    expect(r.status === 200 && r.j.account.email === "ana@example.com" && r.j.totals.chat === 2, "and opens one account");
    expect((await call(`/api/usage/accounts/${anaRow.id}`, { token: ana })).status === 403, "an account cannot open another's usage");
    // The Owner gives Ana a plan: the plans list shows it.
    await call("/api/credits/accounts/plan", { method: "POST", token: owner, body: { email: "ana@example.com", plan: "plus" } });
    r = await call("/api/usage/accounts?days=7", { token: owner });
    expect(r.j.data.find((x) => x.email === "ana@example.com").plan?.name === "Plus", "the plan of every account");
    expect((await call("/api/me/export", { token: ana })).j.usage?.totals?.chat === 2, "the data export includes the usage");
  } finally {
    await gw.close(); omni.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ui() {
  const page = read("renderer/src/pages/Usage.jsx"), main = read("renderer/src/main.jsx"), css = read("renderer/src/styles.css");
  expect(/export function UsagePage/.test(page) && /export function BillingPage/.test(page), "Usage and Billing are two pages");
  expect(/\/api\/usage\/accounts/.test(page) && /Plans of every account/.test(page) && /My usage/.test(page) && /All accounts/.test(page), "Usage: mine, every account (Owner), the plans button");
  expect(/PlanCard/.test(page.slice(page.indexOf("export function BillingPage"))) && !/PlanCard/.test(page.slice(page.indexOf("export function UsagePage"), page.indexOf("export function BillingPage"))), "the plans are on Billing, not on Usage");
  expect(/\["billing",CreditCard,"Billing",true,""\],\["usage",Gauge,"Usage",true,""\]/.test(main) && /tab==="billing"&&<BillingPage embedded/.test(main) && /tab==="usage"&&<UsagePage embedded/.test(main) && /toolPanel\?\.name==="billing"&&<BillingPage/.test(main), "Billing and Usage are sections of Settings (0.7.39), and pages of their own");
  expect(/\["billing",CreditCard,"Billing",null\]/.test(main) && !/\["usage",Gauge,"Usage",null\]/.test(main), "the main page's tool list shows Billing, not Usage");
  expect(/Settings like Claude.s/.test(css) && /\.settingsNav\{overflow-y:auto/.test(css) && /\.settingsPane\{max-height:none;min-height:0;overflow-y:auto\}/.test(css) && /\.settingsModal\.showDetail \.settingsNav\{display:none\}|\.settingsModal\.showDetail>\.modalHead,\.settingsModal\.showDetail \.settingsNav\{display:none\}/.test(css) && /className=\{detail\?"settingsModal showDetail":"settingsModal"\}/.test(main), "Settings: the menu and the page scroll");
}

function speed() {
  const gw = read("local-gateway.cjs"), conn = read("lib/connectors.cjs");
  expect(/const CONTEXT_MS=\{memory:2500,plugins:6000,pages:8000,web:9000,github:5000\}/.test(gw) && /await Promise\.all\(\[\s*user\?\.memoryEnabled!==false\?deadline\(CONTEXT_MS\.memory/.test(gw), "the network context is fetched in parallel, each part with a deadline");
  expect(/async function readToolStream/.test(gw) && /fetchChatCandidate\(cfg,candidate\.id,convo,true,callTimer,\{tools\}\)/.test(gw), "with apps, the first answer streams");
  expect(/TOOLS_WAIT_MS = 6000/.test(conn) && /refreshed in the background/.test(conn), "app tool lists: in parallel, stale ones used at once");
  expect(/calendar\.events\.readonly https:\/\/www\.googleapis\.com\/auth\/calendar\.events"/.test(conn), "Google Calendar can add events");
  expect(/never use one app in place of another/.test(gw) && /Extensions → Connectors/.test(gw), "the AI does not use Notion's calendar for Google Calendar");
}

(async () => { units(); speed(); await gateway(); ui(); console.log("TEST_0738_USAGE_BILLING_PASSED"); })().catch((e) => { console.error(e); process.exit(1); });
