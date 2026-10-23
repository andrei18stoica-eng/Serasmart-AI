// Languages (0.7.26). The interface is written in English; t("English text") gives the same text in the language the
// person picked in the top bar (stored on this device), or the English text when that phrase has no translation yet.
// Arabic switches the page to right-to-left. Romanian, Spanish, French and German travel with the app (locales.js);
// every other language, and any text those four do not cover yet, comes from the server (GET /api/i18n/:lang). The
// texts the screen showed without a translation are sent back (POST, signed in only), the server translates them once
// with the AI for every account, and the screen switches to them. The last copy is kept on this device.
import { useSyncExternalStore } from "react";
import { LOCALES } from "./locales.js";
import { GATEWAY, api, storage, TOKEN_KEY, setTranslator } from "./core.jsx";

export const LANGUAGES = [
  ["en", "English"], ["ro", "Română"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"],
  ["pt", "Português"], ["nl", "Nederlands"], ["pl", "Polski"], ["hu", "Magyar"], ["cs", "Čeština"], ["sv", "Svenska"],
  ["el", "Ελληνικά"], ["tr", "Türkçe"], ["ru", "Русский"], ["uk", "Українська"], ["ar", "العربية"], ["hi", "हिन्दी"],
  ["zh", "中文"], ["ja", "日本語"], ["ko", "한국어"], ["id", "Bahasa Indonesia"], ["vi", "Tiếng Việt"], ["th", "ไทย"]
];
const RTL = new Set(["ar"]);
const KEY = "serasmart-lang";
const known = (code) => LANGUAGES.some(([c]) => c === code);

function read() { try { const v = localStorage.getItem(KEY); return known(v) ? v : "en"; } catch { return "en"; } }
let current = read();
const listeners = new Set();
let version = 0;
const notify = () => { version++; listeners.forEach((fn) => fn()); };
const CACHE = "serasmart-i18n-";
const remote = {}; // lang → { English: translation } from the server
function loadCache(lang) { try { const d = JSON.parse(localStorage.getItem(CACHE + lang) || "null"); if (d && typeof d === "object") remote[lang] = d; } catch {} }
function saveCache(lang) { try { localStorage.setItem(CACHE + lang, JSON.stringify(remote[lang] || {})); } catch {} }
function merge(lang, data) {
  if (!data || typeof data !== "object") return;
  remote[lang] = { ...(remote[lang] || {}), ...data };
  saveCache(lang);
  if (lang === current) notify();
}
const fetched = new Set();
// 0.7.35: how far the server is with translating the whole app into a language ({total, have, running}).
const progress = {};
export function languageProgress(lang = current) { return progress[lang] || null; }
async function fetchRemote(lang, again = false) {
  if (lang === "en" || (fetched.has(lang) && !again)) return;
  fetched.add(lang);
  try {
    const r = await fetch(`${GATEWAY}/api/i18n/${lang}`);
    if (r.ok) { const d = await r.json(); if (d.progress) progress[lang] = d.progress; merge(lang, d.data); if (lang === current) notify(); }
  } catch {}
}
// Picking a language (from the language button, for everyone) asks the server to translate the whole app into it in
// the background; the screen picks the new texts up every 15 seconds until the language is complete.
let follow = null;
const prepared = new Set();
// Romanian travels whole with the app (locales.js), so only the other languages are asked for.
const shippedWhole = (lang) => Object.keys(LOCALES[lang] || {}).length >= 1000;
async function prepare(lang) {
  clearTimeout(follow); follow = null;
  if (lang === "en" || shippedWhole(lang)) return;
  if (storage.get(TOKEN_KEY)) prepared.add(lang);
  if (storage.get(TOKEN_KEY)) {
    try { const d = await api(`/api/i18n/${lang}/prepare`, { method: "POST", body: "{}" }); if (d?.data) { progress[lang] = d.data; if (lang === current) notify(); } } catch {}
  }
  const started = Date.now();
  const tick = async () => {
    if (lang !== current) return;
    await fetchRemote(lang, true);
    const p = progress[lang];
    if (p && p.have < p.total && (p.running || Date.now() - started < 120000) && Date.now() - started < 90 * 60000) follow = setTimeout(tick, 15000);
  };
  follow = setTimeout(tick, 4000);
}
// Texts shown without a translation, sent in one request a moment after the screen settles.
const missing = new Set();
const tried = new Set(); // "lang\ttext" already sent once this session, so a text the server could not translate is not asked again
let timer = null, asking = false;
function askLater() {
  if (timer || current === "en") return;
  timer = setTimeout(async () => {
    timer = null;
    if (asking || !storage.get(TOKEN_KEY) || !missing.size) return;
    const lang = current, keys = [...missing].slice(0, 300);
    keys.forEach((k) => tried.add(lang + "\t" + k));
    asking = true;
    try { merge(lang, (await api(`/api/i18n/${lang}`, { method: "POST", body: JSON.stringify({ keys }) })).data); }
    catch {}
    finally { asking = false; keys.forEach((k) => missing.delete(k)); if (missing.size) askLater(); if (!prepared.has(lang) && lang === current) prepare(lang); }
  }, 2500);
}
function apply() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = current;
  document.documentElement.dir = RTL.has(current) ? "rtl" : "ltr";
}
apply();
if (current !== "en") { loadCache(current); fetchRemote(current).then(() => { const p = progress[current]; if (!p || p.have < p.total) prepare(current); }); }

export function getLanguage() { return current; }
export function setLanguage(code) {
  if (!known(code) || code === current) return;
  current = code;
  try { localStorage.setItem(KEY, code); } catch {}
  missing.clear();
  apply();
  if (code !== "en") { loadCache(code); fetchRemote(code); prepare(code); }
  notify();
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// t("Hello, {name}", { name }) — the English text is the key.
export function t(text, vars) {
  let s = text;
  if (current !== "en" && typeof text === "string") {
    const found = LOCALES[current]?.[text] ?? remote[current]?.[text];
    if (found) s = found;
    else if (text.trim() && missing.size < 600 && !tried.has(current + "\t" + text)) { missing.add(text); askLater(); }
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s;
}
// Re-renders the component when the language changes or new translations arrive.
const snapshot = () => `${current}:${version}`;
export function useLanguage() { useSyncExternalStore(subscribe, snapshot, snapshot); return current; }
// 0.7.34: core.jsx (which i18n imports) translates its own texts and dates through this.
setTranslator(t, getLanguage);
