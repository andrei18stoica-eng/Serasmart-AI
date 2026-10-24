"use strict";
// 0.7.40 — What the AI did in the connected apps, per account: which apps were chosen for a message and why, and
// every action (app, tool, risk, the person's decision, the outcome). Never the values sent: only the names of the
// fields, so no message text, address or token ends up here. Kept in <data>/app-audit.json, the last 500 per account.
const fs = require("fs");
const path = require("path");

const KEEP = 500;

function createAppAudit(dataDir) {
  const file = path.join(dataDir, "app-audit.json");
  let cache = null;
  const read = () => {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(file, "utf8")); } catch { cache = {}; }
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) cache = {};
    return cache;
  };
  let timer = null;
  const save = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 }); fs.renameSync(tmp, file); } catch {}
    }, 200);
    timer.unref?.();
  };
  const fieldsOf = (args) => (args && typeof args === "object" && !Array.isArray(args) ? Object.keys(args).slice(0, 30) : []);
  function record(userId, entry) {
    if (!userId) return;
    const d = read(), list = d[userId] || (d[userId] = []);
    const clean = { at: new Date().toISOString(), kind: String(entry.kind || "action") };
    for (const k of ["app", "tool", "risk", "decision", "outcome", "source", "conversationId"]) if (entry[k] !== undefined && entry[k] !== null) clean[k] = typeof entry[k] === "string" ? entry[k].slice(0, 120) : entry[k];
    if (entry.args) clean.fields = fieldsOf(entry.args);
    if (Array.isArray(entry.selected)) clean.selected = entry.selected.slice(0, 12).map((s) => ({ name: String(s.name || "").slice(0, 80), score: Number(s.score) || 0, reasons: (s.reasons || []).slice(0, 4).map((r) => String(r).slice(0, 120)) }));
    if (Array.isArray(entry.missing) && entry.missing.length) clean.missing = entry.missing.slice(0, 6).map((m) => ({ name: String(m.name || "").slice(0, 80), status: String(m.status || "").slice(0, 30) }));
    list.push(clean);
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    save();
  }
  function list(userId, limit = 100) { return (read()[userId] || []).slice(-Math.max(1, Math.min(KEEP, limit))).reverse(); }
  function remove(userId) { const d = read(); if (d[userId]) { delete d[userId]; save(); } }
  function flush() { if (timer) { clearTimeout(timer); timer = null; try { fs.writeFileSync(file, JSON.stringify(read()), { mode: 0o600 }); } catch {} } }
  return { record, list, remove, flush };
}

module.exports = { createAppAudit, KEEP };
