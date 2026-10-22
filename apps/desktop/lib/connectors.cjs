// Connected apps, like the connectors in Claude (0.7.29). Each app is a remote MCP server (Model Context Protocol): the
// person presses Connect, signs in to the service (OAuth 2.1 with dynamic client registration, done by the official SDK,
// or an OAuth client the Owner registered once, for Google), and the AI can then use the app's tools: search, read,
// create, edit. Every tool call waits for the person's choice (Allow once / Always allow / Deny), decided in the gateway.
//
// Stored per account in the "connectors" collection; the OAuth client and tokens are sealed (sealSecret). Addresses are
// checked before every request: https only, never a local or private network (unless the Owner allows it on a PC).
const crypto = require("crypto");
const dns = require("dns").promises;
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");
const { auth, UnauthorizedError } = require("@modelcontextprotocol/sdk/client/auth.js");
const { isBlockedAddress } = require("./netguard.cjs");
const { BRAND_NAME } = require("./brand.cjs");

// Official remote MCP servers (Docker's and the vendors' lists, October 2026). "sse" servers use the older transport.
const CATALOG = [
  { id: "notion", logo: "notion", name: "Notion", category: "Productivity", url: "https://mcp.notion.com/mcp", description: "Search, read, create and edit pages and databases." },
  { id: "linear", logo: "linear", name: "Linear", category: "Development", url: "https://mcp.linear.app/mcp", description: "Find, create and update issues, projects and comments." },
  { id: "atlassian", logo: "atlassian", name: "Jira & Confluence", category: "Development", url: "https://mcp.atlassian.com/v1/mcp/authv2", description: "Jira issues and Confluence pages: search, create, edit." },
  { id: "asana", approvedOnly: true, logo: "asana", name: "Asana", category: "Productivity", url: "https://mcp.asana.com/sse", transport: "sse", description: "Tasks, projects and comments." },
  { id: "monday", name: "monday.com", category: "Productivity", url: "https://mcp.monday.com/sse", transport: "sse", description: "Boards, items and updates." },
  { id: "canva", name: "Canva", category: "Design", url: "https://mcp.canva.com/mcp", description: "Find, create and edit designs." },
  { id: "miro", logo: "miro", name: "Miro", category: "Design", url: "https://mcp.miro.com/", description: "Boards, sticky notes and diagrams (Miro Enterprise)." },
  { id: "box", approvedOnly: true, logo: "box", name: "Box", category: "Files", url: "https://mcp.box.com", transport: "sse", description: "Search and read files and folders." },
  { id: "webflow", logo: "webflow", name: "Webflow", category: "Websites", url: "https://mcp.webflow.com/sse", transport: "sse", description: "Sites, pages and CMS items." },
  { id: "wix", logo: "wix", name: "Wix", category: "Websites", url: "https://mcp.wix.com/sse", transport: "sse", description: "Your Wix sites, pages and store." },
  { id: "intercom", approvedOnly: true, logo: "intercom", name: "Intercom", category: "Customers", url: "https://mcp.intercom.com/sse", transport: "sse", description: "Conversations and contacts." },
  { id: "close", name: "Close CRM", category: "Customers", url: "https://mcp.close.com/mcp", description: "Leads, contacts and opportunities." },
  { id: "stripe", logo: "stripe", name: "Stripe", category: "Payments", url: "https://mcp.stripe.com", description: "Customers, payments, invoices and products." },
  { id: "paypal", logo: "paypal", name: "PayPal", category: "Payments", url: "https://mcp.paypal.com/sse", transport: "sse", description: "Invoices, orders and transactions." },
  { id: "square", approvedOnly: true, logo: "square", name: "Square", category: "Payments", url: "https://mcp.squareup.com/sse", transport: "sse", description: "Payments, orders, catalog and customers." },
  { id: "vercel", approvedOnly: true, logo: "vercel", name: "Vercel", category: "Development", url: "https://mcp.vercel.com/", description: "Projects, deployments and logs." },
  { id: "sentry", logo: "sentry", name: "Sentry", category: "Development", url: "https://mcp.sentry.dev/mcp", description: "Errors, issues and releases." },
  { id: "netlify", logo: "netlify", name: "Netlify", category: "Development", url: "https://netlify-mcp.netlify.app/mcp", description: "Sites and deploys." },
  { id: "github", logo: "github", name: "GitHub", category: "Development", url: "https://api.githubcopilot.com/mcp/", ownerClient: "github", scope: "repo read:org read:user", tokenHint: "A GitHub personal access token (github_pat_…)", description: "Repositories, issues, pull requests and files." },
  { id: "fireflies", name: "Fireflies", category: "Meetings", url: "https://api.fireflies.ai/mcp", description: "Meeting transcripts and summaries." },
  { id: "deepwiki", name: "DeepWiki", category: "Development", url: "https://mcp.deepwiki.com/mcp", auth: "none", description: "Ask questions about any public GitHub repository." },
  // 0.7.30: more apps, each checked live (server answers, sign-in found, Serasmart can register itself).
  { id: "airtable", logo: "airtable", name: "Airtable", category: "Productivity", url: "https://mcp.airtable.com/mcp", description: "Bases, tables and records: search, create and update." },
  { id: "clickup", logo: "clickup", name: "ClickUp", category: "Productivity", url: "https://mcp.clickup.com/mcp", description: "Tasks, lists, docs and comments." },
  { id: "todoist", logo: "todoist", name: "Todoist", category: "Productivity", url: "https://ai.todoist.net/mcp", description: "Your tasks and projects: add, finish, reschedule." },
  { id: "granola", name: "Granola", category: "Meetings", url: "https://mcp.granola.ai/mcp", description: "Your meeting notes and transcripts." },
  { id: "zapier", logo: "zapier", name: "Zapier", category: "Automation", url: "https://mcp.zapier.com/api/mcp/mcp", description: "Thousands of apps through your Zapier actions." },
  { id: "supabase", logo: "supabase", name: "Supabase", category: "Development", url: "https://mcp.supabase.com/mcp", description: "Projects, databases, SQL and logs." },
  { id: "neon", logo: "neon", name: "Neon", category: "Development", url: "https://mcp.neon.tech/mcp", description: "Postgres databases: query, branch and manage." },
  { id: "prisma", logo: "prisma", name: "Prisma Postgres", category: "Development", url: "https://mcp.prisma.io/mcp", description: "Prisma Postgres databases and migrations." },
  { id: "cfbindings", logo: "cloudflare", name: "Cloudflare", category: "Development", url: "https://bindings.mcp.cloudflare.com/mcp", description: "Workers, KV, R2 and D1 in your Cloudflare account." },
  { id: "cfobservability", logo: "cloudflare", name: "Cloudflare logs", category: "Development", url: "https://observability.mcp.cloudflare.com/mcp", description: "Logs and analytics of your Workers." },
  { id: "cfdocs", logo: "cloudflare", name: "Cloudflare docs", category: "Development", url: "https://docs.mcp.cloudflare.com/mcp", auth: "none", description: "Answers from the Cloudflare documentation (no account)." },
  { id: "semgrep", name: "Semgrep", category: "Development", url: "https://mcp.semgrep.ai/mcp", description: "Scans code for security problems." },
  { id: "jam", name: "Jam", category: "Development", url: "https://mcp.jam.dev/mcp", description: "Bug reports with recordings and logs." },
  { id: "datadog", logo: "datadog", name: "Datadog", category: "Development", url: "https://mcp.datadoghq.com/api/unstable/mcp-server/mcp", description: "Logs, metrics, monitors and incidents." },
  { id: "posthog", logo: "posthog", name: "PostHog", category: "Data", url: "https://mcp.posthog.com/mcp", description: "Product analytics, flags and experiments." },
  { id: "huggingface", logo: "huggingface", name: "Hugging Face", category: "AI", url: "https://huggingface.co/mcp", description: "Models, datasets and Spaces." },
  { id: "replicate", logo: "replicate", name: "Replicate", category: "AI", url: "https://mcp.replicate.com/mcp", description: "Run AI models on Replicate." },
  { id: "exa", name: "Exa", category: "Search", url: "https://mcp.exa.ai/mcp", description: "Web search made for AI." },
  { id: "context7", name: "Context7", category: "Search", url: "https://mcp.context7.com/mcp", description: "Up-to-date documentation for code libraries." },
  { id: "browserbase", name: "Browserbase", category: "Search", url: "https://mcp.browserbase.com/mcp", auth: "none", description: "A browser in the cloud that reads and uses web pages (no account)." },
  { id: "cloudinary", logo: "cloudinary", name: "Cloudinary", category: "Files", url: "https://asset-management.mcp.cloudinary.com/mcp", description: "Your pictures and videos: search, upload, change." },
  { id: "egnyte", logo: "egnyte", name: "Egnyte", category: "Files", url: "https://mcp-server.egnyte.com/mcp", description: "Search and read your company files." },
  { id: "klaviyo", name: "Klaviyo", category: "Customers", url: "https://mcp.klaviyo.com/mcp", description: "Email and SMS campaigns, lists and results." },
  { id: "ramp", name: "Ramp", category: "Payments", url: "https://mcp.ramp.com/mcp", description: "Company cards, expenses and bills." },
  { id: "mercury", name: "Mercury", category: "Payments", url: "https://mcp.mercury.com/mcp", description: "Business bank accounts and transactions." },
  { id: "plaid", name: "Plaid", category: "Payments", url: "https://api.dashboard.plaid.com/mcp/sse", transport: "sse", description: "Your Plaid dashboard: items, usage and issues." },
  // Google's Workspace MCP servers need an OAuth client the Owner registers once in Google Cloud (Developer Preview).
  // Scopes exactly as in developers.google.com/workspace/guides/configure-mcp-servers (Calendar is read-only there).
  { id: "gmail", logo: "gmail", name: "Gmail", category: "Google", url: "https://gmailmcp.googleapis.com/mcp/v1", ownerClient: "google", scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose", description: "Search, read and draft emails." },
  { id: "gdrive", logo: "googledrive", name: "Google Drive", category: "Google", url: "https://drivemcp.googleapis.com/mcp/v1", ownerClient: "google", scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly", description: "Search, read and create files." },
  { id: "gcalendar", logo: "googlecalendar", name: "Google Calendar", category: "Google", url: "https://calendarmcp.googleapis.com/mcp/v1", ownerClient: "google", scope: "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.events.readonly", description: "See your calendars, events and free time (Google allows reading only, for now)." },
  { id: "gdocs", logo: "googledocs", name: "Google Docs", category: "Google", url: "https://docsmcp.googleapis.com/mcp/v1", ownerClient: "google", scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/documents", description: "Read, write and edit documents." },
  { id: "gsheets", logo: "googlesheets", name: "Google Sheets", category: "Google", url: "https://sheetsmcp.googleapis.com/mcp/v1", ownerClient: "google", scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/spreadsheets", description: "Read and edit spreadsheets." }
];
const MAX_TOOLS = 60, TOOLS_TTL = 10 * 60 * 1000, PENDING_TTL = 10 * 60 * 1000;

function createConnectors({ store, seal, open, redirectUri, getConfig = () => ({}), version = "1.0", allowPrivate = () => false, now = () => Date.now() }) {
  const pending = new Map(); // state -> { userId, connId, createdAt }
  const live = new Map();    // connId -> { client, at }
  const toolCache = new Map(); // connId -> { at, tools }

  // https only; the name must not resolve to a local or private address (checked before each request).
  async function checkUrl(raw) {
    let u; try { u = new URL(String(raw)); } catch { throw Object.assign(new Error("The app address is not valid."), { status: 400 }); }
    if (u.protocol !== "https:" && !(allowPrivate() && u.protocol === "http:")) throw Object.assign(new Error("The app address must start with https://."), { status: 400 });
    if (!allowPrivate()) {
      const rows = await dns.lookup(u.hostname, { all: true, verbatim: true }).catch(() => []);
      if (!rows.length) throw Object.assign(new Error(`Cannot resolve ${u.hostname}.`), { status: 400 });
      if (rows.some((r) => isBlockedAddress(r.address))) throw Object.assign(new Error(`${u.hostname} is a local or private address.`), { status: 403, code: "EBLOCKED" });
    }
    return u;
  }
  // fetch for the SDK: every address (redirects too) is checked first.
  async function guardedFetch(input, init = {}) {
    let url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (let hop = 0; hop < 4; hop++) {
      await checkUrl(url);
      const r = await fetch(url, { ...init, redirect: "manual" });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { url = new URL(r.headers.get("location"), url).toString(); continue; }
      return r;
    }
    throw new Error("Too many redirects.");
  }

  const db = () => store.read();
  const find = (d, userId, id) => (d.connectors || []).find((c) => c.id === id && c.userId === userId);
  const readJson = (v) => { try { return v ? JSON.parse(open(v)) : undefined; } catch { return undefined; } };
  function update(connId, patch) {
    const d = db(), c = (d.connectors || []).find((x) => x.id === connId);
    if (!c) return null;
    Object.assign(c, patch, { updatedAt: now() }); store.write(d); return c;
  }
  function ownerClientFor(entry) {
    if (entry.ownerClient !== "google" && entry.ownerClient !== "github") return undefined;
    const cfg = getConfig() || {};
    // One OAuth client the Owner registers once for the whole site (Google Cloud / GitHub OAuth app); every person
    // still signs in with their own account.
    const k = entry.ownerClient;
    const id = String(cfg[k + "ClientId"] || "").trim(), secret = String(cfg[k + "ClientSecret"] || "").trim();
    return id && secret ? { client_id: id, client_secret: secret } : null;
  }

  // The SDK's OAuth provider, backed by the connector record.
  function provider(conn, { state, onRedirect } = {}) {
    const entry = CATALOG.find((x) => x.id === conn.catalogId) || {};
    const owner = ownerClientFor(entry);
    // The address the sign-in returns to, kept from Connect (the web version knows it from the page's own address).
    const back = () => conn.redirectUri || redirectUri();
    return {
      get redirectUrl() { return back(); },
      get clientMetadata() {
        return { client_name: BRAND_NAME, redirect_uris: [back()], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", ...(entry.scope ? { scope: entry.scope } : {}) };
      },
      state: () => state || crypto.randomBytes(16).toString("hex"),
      clientInformation: () => owner || readJson(find(db(), conn.userId, conn.id)?.client),
      saveClientInformation: (info) => { if (!owner) update(conn.id, { client: seal(JSON.stringify(info)) }); },
      tokens: () => readJson(find(db(), conn.userId, conn.id)?.tokens),
      saveTokens: (tokens) => { update(conn.id, { tokens: seal(JSON.stringify(tokens)), status: "connected", error: "" }); },
      redirectToAuthorization: (url) => {
        // Google gives a refresh token only with these, so the person is not asked to sign in again every hour.
        if (entry.ownerClient === "google") { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); }
        onRedirect?.(url.toString());
      },
      saveCodeVerifier: (v) => update(conn.id, { verifier: seal(v) }),
      codeVerifier: () => { const v = open(find(db(), conn.userId, conn.id)?.verifier || ""); if (!v) throw new Error("The sign-in expired. Press Connect again."); return v; },
      invalidateCredentials: (scope) => {
        if (scope === "all" || scope === "tokens") update(conn.id, { tokens: "" });
        if (scope === "all" || scope === "client") update(conn.id, { client: "" });
      }
    };
  }

  function publicView(c) {
    const entry = CATALOG.find((x) => x.id === c.catalogId);
    return { id: c.id, catalogId: c.catalogId || "", logo: entry?.logo || "", name: c.name, url: c.url, status: c.status, error: c.error || "", category: entry?.category || "Custom", toolCount: c.toolCount || 0, createdAt: c.createdAt };
  }
  function catalog(userId) {
    const mine = (db().connectors || []).filter((c) => c.userId === userId);
    return CATALOG.map((e) => {
      const conn = mine.find((c) => c.catalogId === e.id);
      // GitHub without the Owner's OAuth app connects with a personal token; Google needs the Owner's client.
      const tokenInstead = e.ownerClient === "github" && !ownerClientFor(e);
      const needsOwner = e.ownerClient === "google" && !ownerClientFor(e);
      // Checked live (2026-10-22): these only let in apps they approved, so Serasmart cannot sign in to them yet.
      const notYet = e.approvedOnly ? "This app only lets in apps it has approved; Serasmart is not on its list yet." : "";
      return { id: e.id, logo: e.logo || "", name: e.name, category: e.category, description: e.description, auth: tokenInstead ? "token" : (e.auth || "oauth"), tokenHint: e.tokenHint || "", unavailable: notYet || (needsOwner ? "The Owner has to add a Google OAuth client in Settings first." : ""), connected: conn?.status === "connected", connectorId: conn?.id || "" };
    });
  }
  function list(userId) { return (db().connectors || []).filter((c) => c.userId === userId).map(publicView); }

  // Connect: an app without sign-in or with a token connects at once; an OAuth app returns the address to open.
  async function connect(userId, { catalogId, url, name, token, redirect }) {
    const entry = catalogId ? CATALOG.find((x) => x.id === catalogId) : null;
    if (catalogId && !entry) throw Object.assign(new Error("Unknown app."), { status: 404 });
    const address = entry ? entry.url : String(url || "").trim();
    await checkUrl(address);
    if (entry?.ownerClient === "github" && !ownerClientFor(entry) && !token) throw Object.assign(new Error(`This app needs a token: ${entry.tokenHint}.`), { status: 400 });
    if (entry?.approvedOnly) throw Object.assign(new Error("This app only lets in apps it has approved; Serasmart is not on its list yet."), { status: 409 });
    if (entry?.ownerClient === "google" && !ownerClientFor(entry)) throw Object.assign(new Error("The Owner has to add a Google OAuth client in Settings first."), { status: 409 });
    const d = db(); d.connectors = d.connectors || [];
    let conn = d.connectors.find((c) => c.userId === userId && (entry ? c.catalogId === entry.id : c.url === address));
    if (!conn) {
      conn = { id: crypto.randomUUID(), userId, catalogId: entry?.id || "", name: entry?.name || String(name || new URL(address).hostname).slice(0, 80), url: address, transport: entry?.transport || (/\/sse\/?$/.test(address) ? "sse" : "http"), status: "pending", createdAt: now() };
      d.connectors.push(conn);
    }
    if (entry?.auth === "token" || (token && !(entry?.ownerClient && ownerClientFor(entry)))) {
      if (!String(token || "").trim()) throw Object.assign(new Error(entry?.tokenHint ? `This app needs a token: ${entry.tokenHint}.` : "This app needs a token."), { status: 400 });
      conn.bearer = seal(String(token).trim()); conn.status = "connected"; conn.error = "";
    } else if (entry?.auth === "none") { conn.status = "connected"; conn.error = ""; }
    store.write(d);
    if (conn.status === "connected") { await tools(userId, conn.id, true); return { status: "connected", connector: publicView(find(db(), userId, conn.id)) }; }
    // OAuth: discovery, client registration (or the Owner's client) and the sign-in address, by the SDK.
    const state = crypto.randomBytes(24).toString("hex");
    let authorizeUrl = "";
    if (redirect && conn.redirectUri !== redirect) { conn = update(conn.id, { redirectUri: String(redirect), client: conn.redirectUri ? "" : conn.client }) || conn; }
    pending.set(state, { userId, connId: conn.id, createdAt: now() });
    for (const [k, p] of pending) if (now() - p.createdAt > PENDING_TTL) pending.delete(k);
    const result = await auth(provider(conn, { state, onRedirect: (u) => { authorizeUrl = u; } }), { serverUrl: address, scope: entry?.scope, fetchFn: guardedFetch });
    if (result === "AUTHORIZED") { pending.delete(state); update(conn.id, { status: "connected" }); await tools(userId, conn.id, true); return { status: "connected", connector: publicView(find(db(), userId, conn.id)) }; }
    if (!authorizeUrl) throw new Error("The app did not return a sign-in address.");
    return { status: "authorize", authorizeUrl, connector: publicView(find(db(), userId, conn.id)) };
  }
  // The sign-in page came back with a code.
  async function finish(state, code, error) {
    const p = pending.get(String(state || "")); pending.delete(String(state || ""));
    if (!p || now() - p.createdAt > PENDING_TTL) throw Object.assign(new Error("The sign-in expired. Press Connect again."), { status: 400 });
    const conn = find(db(), p.userId, p.connId);
    if (!conn) throw Object.assign(new Error("The app was removed."), { status: 404 });
    if (error) { update(conn.id, { status: "error", error: String(error).slice(0, 200) }); throw Object.assign(new Error(`The app refused the sign-in: ${String(error).slice(0, 200)}`), { status: 400 }); }
    const entry = CATALOG.find((x) => x.id === conn.catalogId);
    const result = await auth(provider(conn), { serverUrl: conn.url, authorizationCode: String(code || ""), scope: entry?.scope, fetchFn: guardedFetch });
    if (result !== "AUTHORIZED") throw new Error("The sign-in did not finish.");
    update(conn.id, { status: "connected", error: "", verifier: "" });
    await tools(p.userId, conn.id, true).catch(() => {});
    return publicView(find(db(), p.userId, conn.id));
  }

  async function clientFor(conn) {
    const hit = live.get(conn.id);
    if (hit && now() - hit.at < TOOLS_TTL) return hit.client;
    if (hit) { try { await hit.client.close(); } catch {} live.delete(conn.id); }
    const headers = conn.bearer ? { Authorization: `Bearer ${open(conn.bearer)}` } : undefined;
    const opts = { fetch: guardedFetch, ...(headers ? { requestInit: { headers } } : { authProvider: provider(conn) }) };
    await checkUrl(conn.url);
    const make = (kind) => kind === "sse" ? new SSEClientTransport(new URL(conn.url), opts) : new StreamableHTTPClientTransport(new URL(conn.url), opts);
    let client = new Client({ name: BRAND_NAME, version: String(version) });
    try { await client.connect(make(conn.transport === "sse" ? "sse" : "http")); }
    catch (e) {
      if (e instanceof UnauthorizedError || e?.code === 401) throw markNeedsSignIn(conn, e);
      if (conn.transport === "sse") throw e;
      client = new Client({ name: BRAND_NAME, version: String(version) });
      await client.connect(make("sse")); update(conn.id, { transport: "sse" });
    }
    live.set(conn.id, { client, at: now() });
    return client;
  }
  function markNeedsSignIn(conn, e) {
    update(conn.id, { status: "signin", error: "Sign in again." });
    return Object.assign(new Error(`${conn.name}: sign in again (Apps → ${conn.name} → Connect).`), { status: 401, cause: e });
  }

  async function tools(userId, connId, fresh = false) {
    const conn = find(db(), userId, connId);
    if (!conn || conn.status !== "connected") return [];
    const cached = toolCache.get(connId);
    if (!fresh && cached && now() - cached.at < TOOLS_TTL) return cached.tools;
    try {
      const client = await clientFor(conn);
      const out = []; let cursor;
      do { const page = await client.listTools(cursor ? { cursor } : {}); out.push(...(page.tools || [])); cursor = page.nextCursor; } while (cursor && out.length < 200);
      const list = out.map((t) => ({ name: t.name, title: t.title || t.annotations?.title || t.name, description: String(t.description || "").slice(0, 800), inputSchema: t.inputSchema || { type: "object", properties: {} }, readOnly: !!t.annotations?.readOnlyHint }));
      toolCache.set(connId, { at: now(), tools: list });
      update(connId, { toolCount: list.length, error: "" });
      return list;
    } catch (e) {
      update(connId, { error: String(e?.message || e).slice(0, 200) });
      if (fresh) throw e;
      return cached?.tools || [];
    }
  }
  // Every connected app's tools, for the AI: names are "<n>__<tool>" (OpenAI allows [a-zA-Z0-9_-], 64 characters).
  async function toolsForChat(userId, { enabled = null } = {}) {
    const conns = (db().connectors || []).filter((c) => c.userId === userId && c.status === "connected" && (!enabled || enabled.includes(c.id)));
    const out = [];
    for (const [i, conn] of conns.entries()) {
      for (const t of await tools(userId, conn.id).catch(() => [])) {
        const name = `a${i + 1}__${String(t.name).replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
        out.push({ name, connId: conn.id, app: conn.name, logo: CATALOG.find((x) => x.id === conn.catalogId)?.logo || "", tool: t.name, title: t.title, readOnly: t.readOnly, schema: { type: "function", function: { name, description: `[${conn.name}] ${t.description}`.slice(0, 1000), parameters: t.inputSchema } } });
        if (out.length >= MAX_TOOLS) return out;
      }
    }
    return out;
  }
  async function call(userId, connId, tool, args = {}) {
    const conn = find(db(), userId, connId);
    if (!conn || conn.status !== "connected") throw Object.assign(new Error("The app is not connected."), { status: 409 });
    const client = await clientFor(conn);
    try {
      const r = await client.callTool({ name: tool, arguments: args && typeof args === "object" ? args : {} });
      const text = (r.content || []).map((c) => c.type === "text" ? c.text : c.type === "resource" ? (c.resource?.text || c.resource?.uri || "") : c.type === "image" ? "[image]" : JSON.stringify(c)).join("\n");
      return { ok: !r.isError, text: (text || JSON.stringify(r.structuredContent || {})).slice(0, 30000) };
    } catch (e) {
      if (e instanceof UnauthorizedError) throw markNeedsSignIn(conn, e);
      live.delete(conn.id);
      throw e;
    }
  }
  async function disconnect(userId, connId) {
    const d = db(), before = (d.connectors || []).length;
    d.connectors = (d.connectors || []).filter((c) => !(c.id === connId && c.userId === userId));
    d.toolApprovals = (d.toolApprovals || []).filter((a) => !(a.userId === userId && a.connId === connId));
    const hit = live.get(connId); live.delete(connId); toolCache.delete(connId);
    if (hit) { try { await hit.client.close(); } catch {} }
    store.write(d);
    return d.connectors.length < before;
  }
  // "Always allow": kept per account, app and tool; listed and removable in Apps.
  function alwaysAllowed(userId, connId, tool) { return (db().toolApprovals || []).some((a) => a.userId === userId && a.connId === connId && a.tool === tool); }
  function allowAlways(userId, connId, tool, app) {
    const d = db(); d.toolApprovals = d.toolApprovals || [];
    if (!d.toolApprovals.some((a) => a.userId === userId && a.connId === connId && a.tool === tool)) d.toolApprovals.push({ id: crypto.randomUUID(), userId, connId, tool, app: String(app || ""), createdAt: now() });
    store.write(d);
  }
  function approvals(userId) { return (db().toolApprovals || []).filter((a) => a.userId === userId).map(({ id, connId, tool, app, createdAt }) => ({ id, connId, tool, app, createdAt })); }
  function revokeApproval(userId, id) { const d = db(); const before = (d.toolApprovals || []).length; d.toolApprovals = (d.toolApprovals || []).filter((a) => !(a.userId === userId && a.id === id)); store.write(d); return d.toolApprovals.length < before; }
  function close() { for (const { client } of live.values()) client.close().catch(() => {}); live.clear(); }

  return { CATALOG, catalog, list, connect, finish, tools, toolsForChat, call, disconnect, alwaysAllowed, allowAlways, approvals, revokeApproval, checkUrl, close };
}

module.exports = { CATALOG, createConnectors };
