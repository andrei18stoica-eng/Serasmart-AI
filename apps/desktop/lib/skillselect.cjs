"use strict";
// 0.7.40 — Choosing skills on their own (asked by the Owner: "the AI picks the skills the request needs, with no fixed
// number: as many as it takes for the best answer").
//
// Every skill has a state: Disabled (enabled:false), Auto (picked when the request needs it) or Always on (auto:true,
// the old «Always on», used in every message and first in line). Choosing reads only the metadata — name, /command,
// description, trigger words, words that rule it out, the skills it needs, the skills it clashes with, its priority;
// the full instructions are put in the prompt only for the skills that were chosen.
//
// How a skill is scored against the message (and, at half weight, the message before it, so a short follow-up keeps
// the skills of the request it follows): a /command or a trigger phrase in the message picks it at once; otherwise the
// words of the message are matched with the words of its name and description (endings ignored: «prezentarea» ~
// «prezentare»), rare words counting more than common ones; a skill is chosen when the score passes the threshold.
// There is no cap: neither on how many skills nor on the size of their instructions (asked by the Owner).

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(("a ai al ale am an and are as at au be but by ca care cat ce cea cel cele cei cu da daca de despre din do does dupa e este eu for fi fie from has have he how i ii il in into is isi it its la le li lor mai make me mi mie my ne nu o of on or ori pe pentru please poti prin sa sau se si sunt te that the their them then there these they this to tu un una unei unui us va vreau want was we what when which who will with would you your yes no can could should help ajuta ajutor imi iti fa faci face scrie write give da-mi").split(" "));
const THRESHOLD = 3.2;

const stem = (w) => (w.length >= 7 ? w.slice(0, 6) : w.length >= 5 ? w.slice(0, 5) : w);
function terms(text) {
  return fold(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
}
const asList = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : []).map((x) => fold(x).trim()).filter(Boolean).slice(0, 30);

/**
 * @param {Array} skills resolved skills (own, library, pack skills), each with slug, name, description, enabled, auto
 * @param {string} text the latest message
 * @param {{previous?: string, context?: string}} more the message before, and project instructions (lower weight)
 * @returns {{ list: Array, log: Array<{slug,name,score,reasons}> }}
 */
function chooseSkills(skills, text, more = {}) {
  const t = String(text || ""), ft = fold(t), prevF = fold(more.previous || ""), ctxF = fold(more.context || "");
  const called = new Set((t.match(/(^|\s)\/([a-z0-9-]{1,32})\b/gi) || []).map((x) => x.trim().slice(1).toLowerCase()));
  const pool = (skills || []).filter((s) => s.enabled !== false);
  // How rare each word is among the person's skills (a word in every skill says little).
  const docs = pool.map((s) => new Set(terms(`${s.name} ${s.slug} ${s.description || ""} ${asList(s.triggers).join(" ")}`)));
  const df = new Map(); for (const d of docs) for (const w of d) df.set(w, (df.get(w) || 0) + 1);
  const idf = (w) => Math.log(1 + pool.length / (df.get(w) || pool.length)) + 0.4;
  const now = [...new Set(terms(t))], before = [...new Set(terms(prevF))].filter((w) => !now.includes(w)), ctx = [...new Set(terms(ctxF))].filter((w) => !now.includes(w));
  const scored = [];
  pool.forEach((s, i) => {
    const slug = String(s.slug || "").toLowerCase(), reasons = []; let score = 0, pick = false;
    if (s.auto) { pick = true; score += 100; reasons.push("always on"); }
    if (called.has(slug)) { pick = true; score += 1000; reasons.push(`/${slug} in the message`); }
    const excludes = asList(s.excludes);
    if (!pick && excludes.some((x) => ft.includes(x))) return; // a word that rules it out
    const triggers = asList(s.triggers);
    const trig = triggers.filter((x) => x.length >= 3 && ft.includes(x));
    if (trig.length) { score += 10; reasons.push(`trigger: ${trig.slice(0, 2).join(", ")}`); }
    const nameTerms = new Set(terms(`${s.name} ${slug.replace(/-/g, " ")}`));
    let words = 0;
    for (const w of now) if (docs[i].has(w)) { score += idf(w) * (nameTerms.has(w) ? 1.6 : 1); words++; }
    let beforeWords = 0;
    for (const w of before) if (docs[i].has(w)) { score += idf(w) * 0.5; beforeWords++; }
    for (const w of ctx) if (docs[i].has(w)) score += idf(w) * 0.3;
    if (words) reasons.push(`${words} matching word${words > 1 ? "s" : ""}`);
    // One common word is not enough: two words, a word from its name, a trigger, or a word that goes on from the request before.
    const strong = trig.length || words >= 2 || (words >= 1 && beforeWords >= 1) || now.some((w) => nameTerms.has(w) && (df.get(w) || 0) <= Math.max(2, pool.length * 0.05));
    if (pick || (strong && score >= THRESHOLD)) scored.push({ skill: s, score: Math.round(score * 10) / 10, reasons, priority: Number(s.priority) || 0 });
  });
  // Needed skills come along; clashing skills: the one with the higher priority (then score) stays.
  const bySlug = new Map(pool.map((s) => [String(s.slug).toLowerCase(), s]));
  for (const x of [...scored]) for (const need of asList(x.skill.requires)) {
    const s = bySlug.get(need);
    if (s && !scored.some((y) => y.skill === s)) scored.push({ skill: s, score: 0, reasons: [`needed by /${x.skill.slug}`], priority: Number(s.priority) || 0 });
  }
  scored.sort((a, b) => (b.skill.auto ? 1 : 0) - (a.skill.auto ? 1 : 0) || b.priority - a.priority || b.score - a.score);
  const kept = [];
  for (const x of scored) {
    const clash = kept.find((k) => asList(k.skill.conflicts).includes(String(x.skill.slug).toLowerCase()) || asList(x.skill.conflicts).includes(String(k.skill.slug).toLowerCase()));
    if (clash) continue;
    kept.push(x);
  }
  // 0.7.40 (asked by the Owner: "no limit"): every chosen skill goes in, with no cap on number or size.
  const list = [], log = [];
  for (const x of kept) { list.push(x.skill); log.push({ slug: x.skill.slug, name: x.skill.name, score: x.score, reasons: x.reasons }); }
  return { list, log };
}

module.exports = { chooseSkills, terms, THRESHOLD };
