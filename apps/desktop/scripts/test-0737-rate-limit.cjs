// 0.7.37: on the website every account reaches apps/server through the same gateway container. The limits used to count
// by IP, so all the accounts shared one budget and the chat answered "Too many attempts. Wait 15 minutes".
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const root = path.join(__dirname, "..", "..", "..");
const server = fs.readFileSync(path.join(root, "apps", "server", "server.cjs"), "utf8");

assert.match(server, /function sessionOrIpKey\(req\)/, "the server counts requests per session");
for (const name of ["app.use(rateLimit(", "const meLimiter = perMinute", "const selfNoticeLimiter"]) {
  const line = server.split("\n").find(l => l.includes(name));
  assert.ok(line && line.includes("keyGenerator: sessionOrIpKey"), `${name} counts per session, not per IP`);
}
// The Owner's decision: no cap on requests per minute unless the server sets one; the old 120 / 600 from .env are ignored.
assert.match(server, /if \(perMinute\("API_REQUESTS_PER_MINUTE"\)\) app\.use\(rateLimit\(/, "the per-minute cap is off by default");
assert.ok(!/process\.env\.(RATE_LIMIT_PER_MINUTE|AUTH_ME_PER_MINUTE)/.test(server), "the old variables are not read");
const compose = fs.readFileSync(path.join(root, "deploy", "hetzner", "docker-compose.yml"), "utf8");
assert.ok(!/RATE_LIMIT_PER_MINUTE|AUTH_ME_PER_MINUTE/.test(compose) && /API_REQUESTS_PER_MINUTE: \$\{API_REQUESTS_PER_MINUTE:-\}/.test(compose), "docker-compose passes no default cap");
const authLine = server.split("\n").find(l => l.includes("const authLimiter"));
assert.ok(authLine && !authLine.includes("sessionOrIpKey"), "sign-in attempts are still counted per IP");

// The key itself: a session is hashed (never stored as is), the rest falls back to the IP.
const rateLimit = require(path.join(root, "apps", "server", "node_modules", "express-rate-limit"));
const body = server.slice(server.indexOf("function sessionOrIpKey"), server.indexOf("// Requests per minute are unlimited"));
const sha256 = v => crypto.createHash("sha256").update(String(v)).digest("hex");
const key = new Function("rateLimit", "sha256", `${body}; return sessionOrIpKey;`)(rateLimit, sha256);
const a = key({ headers: { authorization: "Bearer aaaaaaaaaaaaaaaaaaaaaaaa" }, ip: "172.18.0.5" });
const b = key({ headers: { authorization: "Bearer bbbbbbbbbbbbbbbbbbbbbbbb" }, ip: "172.18.0.5" });
assert.notEqual(a, b, "two accounts behind the same gateway have separate budgets");
assert.ok(a.startsWith("s:") && !a.includes("aaaa"), "the session key is a hash");
assert.ok(key({ headers: {}, ip: "203.0.113.9" }).startsWith("ip:"), "requests without a session count per IP");

console.log("TEST_0737_RATE_LIMIT_PASSED");
