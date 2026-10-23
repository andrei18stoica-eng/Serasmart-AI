// Usage (0.7.38, asked by the Owner: "Usage should show what each account uses; everyone sees their own, the Owner
// sees all of them"). Every answer, picture, video and voice recording that really came out is counted here, whether or
// not plans and credits are turned on, so the Owner sees the consumption of every account from the first day.
//
// Per account and per day (in the server's time zone): messages, pictures, videos, voice seconds and the credits the
// work would cost at plan prices (lib/credits.cjs cost(), also for accounts that are not charged), plus the models
// used and the last 100 events. Days older than KEEP_DAYS are dropped. The log lives in <data>/usage.json.
"use strict";
const fs = require("fs");
const path = require("path");
const { renameWithRetry } = require("./store.cjs");

const KEEP_DAYS = 120;
const RECENT = 100;
const KINDS = ["chat", "image", "video", "transcribe"];

function dayKey(ms, timeZone) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch { return new Date(ms).toISOString().slice(0, 10); }
}

function emptyTotals() { return { chat: 0, image: 0, video: 0, transcribe: 0, seconds: 0, credits: 0 }; }

function createUsage(dataDir, { now: clock = () => Date.now(), timeZone = "Europe/Bucharest" } = {}) {
  const file = path.join(dataDir, "usage.json");
  let db = null;
  function load() {
    if (db) return db;
    try { db = JSON.parse(fs.readFileSync(file, "utf8")); } catch { db = null; }
    if (!db || typeof db !== "object") db = {};
    db.users = db.users && typeof db.users === "object" ? db.users : {};
    return db;
  }
  function save() {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
      renameWithRetry(tmp, file);
    } catch { /* usage is best effort: a failed write never stops an answer */ }
  }
  function userOf(userId) {
    const d = load(), key = String(userId);
    if (!d.users[key] || typeof d.users[key] !== "object") d.users[key] = { days: {}, recent: [] };
    const u = d.users[key];
    u.days = u.days && typeof u.days === "object" ? u.days : {};
    u.recent = Array.isArray(u.recent) ? u.recent : [];
    return u;
  }
  function prune(u, t) {
    const oldest = dayKey(t - KEEP_DAYS * 86400000, timeZone);
    for (const k of Object.keys(u.days)) if (k < oldest) delete u.days[k];
  }

  // One piece of work that came out: kind = chat | image | video | transcribe.
  function record(userId, kind, { model = "", credits = 0, seconds = 0, charged = null } = {}) {
    if (!userId || !KINDS.includes(kind)) return;
    const t = clock(), u = userOf(userId), k = dayKey(t, timeZone);
    const day = u.days[k] || (u.days[k] = { ...emptyTotals(), models: {} });
    day.models = day.models && typeof day.models === "object" ? day.models : {};
    day[kind] = (Number(day[kind]) || 0) + 1;
    const secs = kind === "video" || kind === "transcribe" ? Math.max(0, Math.round(Number(seconds) || 0)) : 0;
    day.seconds = (Number(day.seconds) || 0) + (kind === "transcribe" ? secs : 0);
    const c = Math.max(0, Math.round(Number(credits) || 0));
    day.credits = (Number(day.credits) || 0) + c;
    const m = String(model || "").slice(0, 120);
    if (m) {
      const row = day.models[m] || (day.models[m] = { count: 0, credits: 0 });
      row.count += 1; row.credits += c;
    }
    u.recent.unshift({ at: t, kind, model: m || undefined, credits: c, ...(secs ? { seconds: secs } : {}), ...(charged === null ? {} : { charged: !!charged }) });
    u.recent = u.recent.slice(0, RECENT);
    u.lastAt = t;
    prune(u, t);
    save();
  }

  // The last `days` days of one account: a row per day (oldest first), the totals and the models.
  function summary(userId, days = 30) {
    const n = Math.max(1, Math.min(KEEP_DAYS, Math.floor(Number(days) || 30)));
    const u = load().users[String(userId)] || { days: {}, recent: [] }, t = clock();
    const rows = [], totals = emptyTotals(), models = {};
    for (let i = n - 1; i >= 0; i--) {
      const k = dayKey(t - i * 86400000, timeZone);
      if (rows.length && rows[rows.length - 1].date === k) continue;
      const d = u.days?.[k] || {};
      const row = { date: k };
      for (const f of Object.keys(totals)) { row[f] = Number(d[f]) || 0; totals[f] += row[f]; }
      rows.push(row);
      for (const [m, v] of Object.entries(d.models || {})) {
        const r = models[m] || (models[m] = { model: m, count: 0, credits: 0 });
        r.count += Number(v.count) || 0; r.credits += Number(v.credits) || 0;
      }
    }
    const since = rows.length ? rows[0].date : dayKey(t, timeZone);
    return {
      days: n, since, daily: rows, totals,
      models: Object.values(models).sort((a, b) => b.count - a.count).slice(0, 12),
      recent: (u.recent || []).filter((e) => dayKey(e.at, timeZone) >= since).slice(0, 50),
      lastAt: u.lastAt || null
    };
  }
  function totalsFor(userId, days = 30) {
    const s = summary(userId, days);
    return { totals: s.totals, lastAt: s.lastAt, topModel: s.models[0]?.model || null };
  }
  function remove(userId) { const d = load(); if (d.users[String(userId)]) { delete d.users[String(userId)]; save(); } }
  return { record, summary, totalsFor, remove, file };
}

module.exports = { createUsage, KINDS, KEEP_DAYS, dayKey };
