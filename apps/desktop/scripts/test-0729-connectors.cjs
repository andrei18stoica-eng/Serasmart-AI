// 0.7.29, asked by the Owner: plugins that work like the connectors in Claude. The person connects an app (a remote MCP
// server: with a token, or signing in on the app's own page with OAuth), and in chat the AI can use the app's tools; every
// action waits for «Allow once», «Always allow» or «Deny». «Always allow» is kept per account, app and tool and can be taken
// back. Here: a pretend app (MCP over HTTP), a pretend sign-in server and a pretend AI that asks for a tool.
const fs = require("fs"), http = require("http"), os = require("os"), path = require("path");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { ListToolsRequestSchema, CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

function expect(v, m) { if (!v) throw new Error(m); }
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

// The pretend app: two tools; only requests with the right token get in.
function makeApp({ token, oauth = false }) {
  const calls = [];
  let base = "";
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, base);
    if (oauth) {
      // OAuth 2.1 with discovery and dynamic client registration, like the real connectors.
      const json = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) return json({ resource: base + "/mcp", authorization_servers: [base] });
      if (url.pathname === "/.well-known/oauth-authorization-server") return json({ issuer: base, authorization_endpoint: base + "/authorize", token_endpoint: base + "/token", registration_endpoint: base + "/register", response_types_supported: ["code"], code_challenge_methods_supported: ["S256"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"] });
      if (url.pathname === "/register") { const body = JSON.parse(await readBody(req)); calls.push({ register: body }); return json({ ...body, client_id: "client-1" }, 201); }
      if (url.pathname === "/token") { const form = new URLSearchParams(await readBody(req)); calls.push({ token: Object.fromEntries(form) }); return form.get("code") === "good-code" && form.get("code_verifier") ? json({ access_token: token, token_type: "Bearer", expires_in: 3600, refresh_token: "r1" }) : json({ error: "invalid_grant" }, 400); }
    }
    if (url.pathname !== "/mcp") { res.writeHead(404); return res.end(); }
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, oauth ? { "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"` } : {});
      return res.end();
    }
    const server = new Server({ name: "notes", version: "1.0.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
      { name: "search_notes", description: "Search the notes.", inputSchema: { type: "object", properties: { q: { type: "string" } } }, annotations: { readOnlyHint: true, title: "Search notes" } },
      { name: "create_note", description: "Create a note.", inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] }, annotations: { title: "Create note" } }
    ] }));
    server.setRequestHandler(CallToolRequestSchema, async (r) => {
      calls.push({ tool: r.params.name, args: r.params.arguments });
      return { content: [{ type: "text", text: r.params.name === "create_note" ? `created ${r.params.arguments?.title}` : "3 notes found" }] };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    const raw = req.method === "POST" ? await readBody(req) : "";
    await transport.handleRequest(req, res, raw ? JSON.parse(raw) : undefined);
  });
  return { srv, calls, setBase: (b) => { base = b; } };
}

async function unit() {
  const { createConnectors, CATALOG } = require("../lib/connectors.cjs");
  expect(CATALOG.length >= 20 && CATALOG.every((x) => /^https:\/\//.test(x.url)), "a catalog of real https MCP servers");
  expect(CATALOG.filter((x) => x.ownerClient === "google").length === 5, "the five Google apps use the Owner's OAuth client");
  const c = createConnectors({ store: { read: () => ({}), write() {} }, seal: (x) => x, open: (x) => x, redirectUri: () => "http://127.0.0.1/cb" });
  for (const bad of ["http://example.com/mcp", "https://127.0.0.1/mcp", "https://localhost/mcp", "https://10.0.0.5/mcp", "https://[::1]/mcp", "javascript:alert(1)"]) {
    let failed = false; try { await c.checkUrl(bad); } catch { failed = true; }
    expect(failed, "refused on a public server: " + bad);
  }
  const page = c.catalog("u1").find((x) => x.id === "gmail");
  expect(page.unavailable && /Google OAuth client/.test(page.unavailable), "Gmail waits for the Owner's Google client");
}

async function gateway() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "conn-"));
  const app = makeApp({ token: "secret-1" }), oauthApp = makeApp({ token: "oauth-token", oauth: true });
  const appPort = await listen(app.srv), oauthPort = await listen(oauthApp.srv);
  app.setBase(`http://127.0.0.1:${appPort}`); oauthApp.setBase(`http://127.0.0.1:${oauthPort}`);
  let rejectTools = false, sawTools = 0, appsSystem = "";
  const omni = http.createServer(async (req, res) => {
    const b = await readBody(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/models") return res.end(JSON.stringify({ data: [{ id: "Ai principal", owned_by: "combo" }] }));
    const body = JSON.parse(b);
    if (body.tools) {
      sawTools++;
      if (rejectTools) { res.statusCode = 400; return res.end(JSON.stringify({ error: { message: "tools are not supported" } })); }
      appsSystem = body.messages.filter((m) => m.role === "system" && /CONNECTED APPS:/.test(m.content)).map((m) => m.content).join("\n");
      expect(body.stream === false && /CONNECTED APPS: Notes/.test(appsSystem), "the AI is told which apps are connected");
      const last = body.messages.at(-1);
      if (last.role === "tool") return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Done: " + last.content } }] }));
      const create = body.tools.find((t) => /create_note$/.test(t.function.name));
      return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: create.function.name, arguments: JSON.stringify({ title: "Hello" }) } }] } }] }));
    }
    res.setHeader("content-type", "text/event-stream");
    res.end('data: {"choices":[{"delta":{"content":"Plain answer."}}]}\n\ndata: [DONE]\n\n');
  });
  const omniPort = await listen(omni);
  const cfg = { baseUrl: `http://127.0.0.1:${omniPort}/v1`, apiKey: "k", model: "Ai principal", webSearchEnabled: false, githubAutoContext: false, directChatEnabled: false, ownerEmail: "owner@example.com", allowPrivatePlugins: true };
  const gw = require("../local-gateway.cjs").startLocalGateway({ dataDir: dir, port: 8873, host: "127.0.0.1", getOmniConfig: () => cfg });
  const base = "http://127.0.0.1:8873";
  const call = async (p, { method = "GET", body, token } = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch {} return { status: r.status, j, text }; };
  // Reads the chat answer; at each approval request, answers with decide(run).
  async function chat(token, decide) {
    const r = await fetch(base + "/api/chat/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ messages: [{ role: "user", content: "Make a note called Hello" }] }) });
    expect(r.ok, "chat answers: " + r.status);
    const events = []; let buf = "", text = "";
    const reader = r.body.getReader(), dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n"); buf = parts.pop();
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:")); if (!line) continue;
        const raw = line.slice(5).trim(); if (raw === "[DONE]") continue;
        const j = JSON.parse(raw); events.push(j);
        if (j.choices) text += j.choices[0].delta.content || "";
        if (j.serasmart_tool?.status === "ask" && decide) await decide(j.serasmart_tool);
      }
    }
    return { events, text, runs: events.filter((e) => e.serasmart_tool).map((e) => e.serasmart_tool) };
  }
  try {
    await call("/auth/register", { method: "POST", body: { email: "owner@example.com", password: "password123", name: "Owner" } });
    const user = (await call("/auth/register", { method: "POST", body: { email: "user@example.com", password: "password123", name: "User" } })).j.token;
    const other = (await call("/auth/register", { method: "POST", body: { email: "other@example.com", password: "password123", name: "Other" } })).j.token;
    // Without a connected app, chat is unchanged (no tools are sent).
    expect((await chat(user)).text === "Plain answer." && sawTools === 0, "no apps: a normal answer");
    let r = await call("/api/connectors", { token: user });
    expect(r.status === 200 && r.j.data.catalog.length >= 20 && r.j.data.connected.length === 0, "the catalog: " + r.text.slice(0, 200));
    expect((await call("/api/connectors/connect", { method: "POST", token: user, body: { url: `http://127.0.0.1:${appPort}/mcp`, name: "Notes", token: "wrong" } })).status >= 400, "a wrong token does not connect");
    r = await call("/api/connectors/connect", { method: "POST", token: user, body: { url: `http://127.0.0.1:${appPort}/mcp`, name: "Notes", token: "secret-1" } });
    expect(r.status === 200 && r.j.data.status === "connected" && r.j.data.connector.toolCount === 2, "connected with a token: " + r.text);
    const connId = r.j.data.connector.id;
    expect((await call(`/api/connectors/${connId}/tools`, { token: other })).j.data?.length === 0, "another account does not see the app's actions");
    r = await call(`/api/connectors/${connId}/tools`, { token: user });
    expect(r.j.data.map((t) => t.name).sort().join() === "create_note,search_notes" && r.j.data.find((t) => t.name === "search_notes").readOnly, "the app's actions: " + r.text);

    // Allow once: the action runs, the AI gets the result, and asks again next time.
    let stranger = null;
    let out = await chat(user, async (run) => {
      stranger = (await call("/api/connectors/approve", { method: "POST", token: other, body: { callId: run.id, decision: "always" } })).status;
      expect((await call("/api/connectors/approve", { method: "POST", token: user, body: { callId: run.id, decision: "once" } })).status === 200, "approve once");
    });
    expect(stranger === 404, "another account cannot answer the request");
    const ask = out.runs.find((x) => x.status === "ask");
    expect(ask && ask.app === "Notes" && ask.tool === "create_note" && ask.args.title === "Hello" && !ask.readOnly, "the request shows the app, the action and what it will send: " + JSON.stringify(out.runs));
    expect(out.runs.at(-1).status === "done" && out.text === "Done: created Hello", "allowed once: " + out.text);
    expect(app.calls.filter((c) => c.tool === "create_note").length === 1, "the app did the action once");

    // Deny: nothing runs in the app; the AI is told.
    out = await chat(user, (run) => call("/api/connectors/approve", { method: "POST", token: user, body: { callId: run.id, decision: "deny" } }));
    expect(out.runs.some((x) => x.status === "ask") && out.runs.at(-1).status === "denied" && /denied/.test(out.text), "denied: " + out.text);
    expect(app.calls.filter((c) => c.tool === "create_note").length === 1, "a denied action does not reach the app");

    // Always allow: kept, then the action runs without asking; removing it asks again.
    out = await chat(user, (run) => call("/api/connectors/approve", { method: "POST", token: user, body: { callId: run.id, decision: "always" } }));
    expect(out.runs.at(-1).status === "done", "always allow runs it");
    r = await call("/api/connectors", { token: user });
    expect(r.j.data.approvals.length === 1 && r.j.data.approvals[0].tool === "create_note", "«Always allow» is listed");
    out = await chat(user, () => { throw new Error("must not ask"); });
    expect(!out.runs.some((x) => x.status === "ask") && out.runs.at(-1).status === "done", "an always-allowed action does not ask");
    expect((await call(`/api/connectors/approvals/${r.j.data.approvals[0].id}`, { method: "DELETE", token: other })).status === 404, "another account cannot remove it");
    expect((await call(`/api/connectors/approvals/${r.j.data.approvals[0].id}`, { method: "DELETE", token: user })).status === 200, "removed");
    out = await chat(user, (run) => call("/api/connectors/approve", { method: "POST", token: user, body: { callId: run.id, decision: "deny" } }));
    expect(out.runs.some((x) => x.status === "ask"), "after removing it, the AI asks again");

    // A model that does not take tools: the normal answer, without the apps.
    rejectTools = true;
    expect((await chat(user)).text === "Plain answer.", "no model takes tools: a normal answer");
    rejectTools = false;
    // Apps can be turned off for a message.
    const before = sawTools;
    const plain = await fetch(base + "/api/chat/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + user }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }], apps: false }) });
    expect(/Plain answer/.test(await plain.text()) && sawTools === before, "apps off for a message");

    // The AI acts on what the person asks, without the app being named, and knows the date and time where they are.
    expect(/even when the person does not name the app/.test(appsSystem) && /basketball match on Saturday/.test(appsSystem), "the AI uses the apps on its own: " + appsSystem.slice(0, 200));
    await chat(user, (run) => call("/api/connectors/approve", { method: "POST", token: user, body: { callId: run.id, decision: "deny" } }));
    const zoned = await fetch(base + "/api/chat/stream", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + user }, body: JSON.stringify({ messages: [{ role: "user", content: "add it" }], timeZone: "Asia/Tokyo" }) });
    const zr = zoned.body.getReader(); let zbuf = "";
    while (!/serasmart_tool/.test(zbuf)) { const { value, done } = await zr.read(); if (done) break; zbuf += new TextDecoder().decode(value); }
    expect(/Now: \w+day,? \d{1,2} \w+ \d{4},? (at )?\d\d:\d\d \(Asia\/Tokyo\)/.test(appsSystem), "the date and time in the person's zone: " + appsSystem.slice(-120));
    const zid = JSON.parse(zbuf.split("\n").find((l) => l.includes("serasmart_tool")).slice(5)).serasmart_tool.id;
    await call("/api/connectors/approve", { method: "POST", token: user, body: { callId: zid, decision: "deny" } });
    while (!(await zr.read()).done);

    // A request waits until the person decides, also when the page is closed: the answer continues on the server,
    // the action is listed as waiting, and once allowed the answer is saved in the conversation.
    const conv = (await call("/api/conversations", { method: "POST", token: user, body: { title: "Plan", messages: [] } })).j.data;
    const ctl = new AbortController();
    const resp = await fetch(base + "/api/chat/stream", { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", authorization: "Bearer " + user }, body: JSON.stringify({ requestId: "req-closed-page-1", conversationId: conv.id, messages: [{ role: "user", content: "Make a note called Hello" }] }) });
    const rd = resp.body.getReader(); let got = "";
    while (!/"status":"ask"/.test(got)) { const { value, done } = await rd.read(); if (done) break; got += new TextDecoder().decode(value); }
    ctl.abort(); // the page is closed
    await new Promise((r) => setTimeout(r, 400));
    let pending = (await call("/api/connectors/pending", { token: user })).j.data;
    expect(pending.length === 1 && pending[0].source.kind === "chat" && pending[0].source.conversationId === conv.id && pending[0].args.title === "Hello", "still waiting after the page closed: " + JSON.stringify(pending));
    expect((await call("/api/connectors/pending", { token: other })).j.data.length === 0, "another account sees nothing");
    const job = (await call("/api/chat/jobs/req-closed-page-1", { token: user })).j.data;
    expect(job.status === "running" && job.toolRuns?.[0]?.status === "ask", "the job shows the waiting action to an app that comes back: " + JSON.stringify(job));
    const notes = app.calls.filter((c) => c.tool === "create_note").length;
    expect((await call("/api/connectors/approve", { method: "POST", token: user, body: { callId: pending[0].id, decision: "once" } })).status === 200, "allowed later");
    for (let i = 0; i < 50 && (await call("/api/chat/jobs/req-closed-page-1", { token: user })).j.data?.status === "running"; i++) await new Promise((r) => setTimeout(r, 100));
    const saved = (await call("/api/conversations", { token: user })).j.data.find((c) => c.id === conv.id).messages.at(-1);
    expect(saved.content === "Done: created Hello" && saved.toolRuns[0].status === "done" && app.calls.filter((c) => c.tool === "create_note").length === notes + 1, "the answer is saved with the action: " + JSON.stringify(saved));
    expect(!/APPROVAL_MS|setTimeout\(gone/.test(fs.readFileSync(path.join(__dirname, "..", "local-gateway.cjs"), "utf8")), "no time limit on a decision");

    // Automations work in the apps too: the action waits in the list until the person decides.
    r = await call("/api/automations", { method: "POST", token: user, body: { title: "Weekly notes", prompt: "Make a note called Hello", frequency: "weekly", weekday: 1, time: "09:00", timeZone: "Europe/Bucharest" } });
    expect(r.status === 200 || r.status === 201, "automation made: " + r.text);
    const auto = r.j.data;
    const running = call(`/api/automations/${auto.id}/run`, { method: "POST", token: user, body: {} });
    for (let i = 0; i < 50 && !(pending = (await call("/api/connectors/pending", { token: user })).j.data).length; i++) await new Promise((res) => setTimeout(res, 100));
    expect(pending.length === 1 && pending[0].source.kind === "automation" && pending[0].source.name === "Weekly notes", "the automation waits for approval: " + JSON.stringify(pending));
    const waiting = (await call("/api/automations", { token: user })).j.data.find((a) => a.id === auto.id);
    expect(waiting.lastStatus === "waiting_approval" && /Waiting for your approval: Notes/.test(waiting.lastResult), "the automation says it is waiting: " + JSON.stringify(waiting));
    await call("/api/connectors/approve", { method: "POST", token: user, body: { callId: pending[0].id, decision: "once" } });
    r = await running;
    const done = (await call("/api/automations", { token: user })).j.data.find((a) => a.id === auto.id);
    expect(r.status === 200 && /Done: created Hello/.test(done.lastResult) && /Notes: Create note — done/.test(done.lastResult), "the automation did it in the app: " + r.text + " " + done.lastResult);

    // OAuth: discovery, client registration, sign-in page, code → connected.
    r = await call("/api/connectors/connect", { method: "POST", token: user, body: { url: `http://127.0.0.1:${oauthPort}/mcp`, name: "Docs" } });
    expect(r.status === 200 && r.j.data.status === "authorize", "an OAuth app returns the sign-in address: " + r.text);
    const auth = new URL(r.j.data.authorizeUrl);
    expect(auth.pathname === "/authorize" && auth.searchParams.get("client_id") === "client-1" && auth.searchParams.get("code_challenge_method") === "S256" && auth.searchParams.get("redirect_uri") === `${base}/api/connectors/oauth/callback`, "PKCE sign-in with the registered client: " + auth);
    expect(oauthApp.calls[0].register.redirect_uris[0] === `${base}/api/connectors/oauth/callback`, "the client is registered with the return address");
    const state = auth.searchParams.get("state");
    let page = await call(`/api/connectors/oauth/callback?state=nope&code=good-code`);
    expect(page.status === 400 && /expired/.test(page.text), "an unknown sign-in is refused");
    page = await call(`/api/connectors/oauth/callback?state=${state}&code=good-code`);
    expect(page.status === 200 && /Connected/.test(page.text) && /Docs is connected/.test(page.text), "the sign-in page says connected: " + page.text.slice(0, 300));
    expect(oauthApp.calls.some((c) => c.token?.code_verifier), "the code is exchanged with the PKCE verifier");
    r = await call("/api/connectors", { token: user });
    const docs = r.j.data.connected.find((c) => c.name === "Docs");
    expect(docs.status === "connected" && docs.toolCount === 2, "the OAuth app is connected: " + JSON.stringify(docs));

    // Disconnect removes the app and its always-allowed actions.
    expect((await call(`/api/connectors/${connId}`, { method: "DELETE", token: other })).status === 404, "another account cannot disconnect it");
    expect((await call(`/api/connectors/${connId}`, { method: "DELETE", token: user })).status === 200, "disconnected");
    r = await call("/api/connectors", { token: user });
    expect(r.j.data.connected.length === 1 && r.j.data.approvals.length === 0, "only the OAuth app is left");
  } finally {
    await gw.close(); omni.close(); app.srv.close(); oauthApp.srv.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function sources() {
  const ui = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "pages", "Connectors.jsx"), "utf8");
  expect(/Allow once/.test(ui) && /Always allow/.test(ui) && /"Deny"/.test(ui) && /\/api\/connectors\/approve/.test(ui), "the approval card");
  expect(!/<img/.test(ui), "no company logos: letters stand in for them");
  const main = fs.readFileSync(path.join(__dirname, "..", "renderer", "src", "main.jsx"), "utf8");
  expect(/j\?\.serasmart_tool/.test(main) && /<ToolRunCard key=\{r\.id\} run=\{r\}\/>/.test(main), "the chat shows the app's actions");
  const settings = fs.readFileSync(path.join(__dirname, "..", "lib", "serversettings.cjs"), "utf8");
  expect(/"googleClientSecret"\]/.test(settings) && /"googleClientId"/.test(settings), "the Owner sets the Google client on the site");
  for (const f of ["../../../deploy/hetzner/docker-compose.yml", "../../cloud/docker-compose.yml"]) expect(/GOOGLE_CLIENT_SECRET: \$\{GOOGLE_CLIENT_SECRET:-\}/.test(fs.readFileSync(path.join(__dirname, f), "utf8")), f + " passes the Google client");
  const cloud = JSON.parse(fs.readFileSync(path.join(__dirname, "../../cloud/package.json"), "utf8"));
  expect(cloud.dependencies["@modelcontextprotocol/sdk"] === require("../package.json").dependencies["@modelcontextprotocol/sdk"], "the site has the same MCP library");
}

(async () => { await unit(); await gateway(); sources(); console.log("0.7.29 connected apps OK"); })().catch((e) => { console.error(e); process.exit(1); });
