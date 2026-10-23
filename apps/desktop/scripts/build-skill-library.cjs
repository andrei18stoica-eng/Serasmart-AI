#!/usr/bin/env node
// Builds lib/skill-library.json (0.7.31): skill packs and skills taken from open-source repositories whose
// licences allow publishing them (MIT, Apache 2.0, BSD, CC0, CC-BY). Run it by hand when the sources change:
//   node scripts/build-skill-library.cjs <folder with the cloned repositories>
// The folder holds one clone per source, named like SOURCES[].dir. Nothing here runs when the app runs.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = process.argv[2];
if (!ROOT) { console.error("usage: node scripts/build-skill-library.cjs <sources folder>"); process.exit(1); }
const OUT = path.join(__dirname, "..", "lib", "skill-library");
const MAX_CHARS = 40000;
const OK_LICENSE = /^(MIT|Apache-2\.0|BSD-[23]-Clause|CC0-1\.0|CC-BY-4\.0)$/;

// The licence a skill's own front matter names, when it names one that is not open enough to publish.
// (In the science repository this field often names the licence of the library the skill teaches; we still
// leave out every skill whose field mentions a non-commercial, copyleft, proprietary or unknown licence.)
const BAD_FIELD = /non-?commercial|\bNC\b|GPL|proprietary|unknown|biopython license|polyform/i;

function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fields: {}, body: text };
  const fields = {}; const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i]);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^[>|][+-]?$/.test(value) || value === "") {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) block.push(lines[++i].trim());
      value = block.join(" ").replace(/\s+/g, " ").trim();
    }
    fields[kv[1]] = value.replace(/^["']|["']$/g, "");
  }
  return { fields, body: text.slice(m[0].length) };
}

function titleOf(slug) {
  return slug.split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function commitOf(dir) {
  try { return execFileSync("git", ["-C", dir, "rev-parse", "--short=10", "HEAD"], { encoding: "utf8" }).trim(); } catch { return ""; }
}

function readSkill(file, skipped, where) {
  const text = fs.readFileSync(file, "utf8");
  const { fields, body } = frontMatter(text);
  const slug = String(fields.name || path.basename(path.dirname(file))).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const instructions = body.trim();
  if (fields.license && BAD_FIELD.test(fields.license)) { skipped.push(`${where}/${slug}: licence field «${fields.license.slice(0, 60)}»`); return null; }
  if (!instructions) { skipped.push(`${where}/${slug}: empty`); return null; }
  if (instructions.length > MAX_CHARS) { skipped.push(`${where}/${slug}: ${instructions.length} characters (over ${MAX_CHARS})`); return null; }
  return { slug, name: titleOf(slug), description: String(fields.description || "").slice(0, 400), instructions };
}

function skillsIn(dir, skipped, where, only) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort()
    .filter(d => (!only || only.includes(d)) && fs.existsSync(path.join(dir, d, "SKILL.md")))
    .map(d => readSkill(path.join(dir, d, "SKILL.md"), skipped, where)).filter(Boolean);
}

const SOURCES = [];
const packs = [];
const skipped = [];
const licenses = {};

// 0. Serasmart's own plugins (0.7.33+), written for Serasmart AI and kept in this repository: apps/desktop/skills/<pack>/
// with a pack.json (id, name, description, category, order) and one .md per skill. They come first in the library.
{
  const root = path.join(__dirname, "..", "skills");
  SOURCES.push({ id: "serasmart", repo: "", commit: "", license: "Serasmart AI", copyright: "Copyright SeranoConsult SRL (Serasmart AI)", licenseFile: "" });
  const dirs = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, "pack.json")));
  const metas = dirs.map((d) => ({ d, meta: JSON.parse(fs.readFileSync(path.join(root, d, "pack.json"), "utf8")) })).sort((a, b) => (a.meta.position ?? 99) - (b.meta.position ?? 99));
  for (const { d, meta } of metas) {
    const order = meta.order || [];
    const files = fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".md")).sort((x, y) => ((order.indexOf(x.slice(0, -3)) + 1 || 999) - (order.indexOf(y.slice(0, -3)) + 1 || 999)) || x.localeCompare(y));
    const skills = files.map((f) => readSkill(path.join(root, d, f), skipped, "serasmart")).filter(Boolean);
    packs.push({ id: meta.id, name: meta.name, category: meta.category || "business", source: "serasmart", author: "Serasmart AI", license: "Serasmart AI", description: meta.description, skills });
  }
}

// 1. Anthropic's skills: only the ones whose own LICENSE.txt is Apache 2.0. docx, pdf, pptx and xlsx are
// "All rights reserved" (source-available, not open source) and doc-coauthoring has no licence file: left out.
{
  const dir = path.join(ROOT, "anthropics_skills"); const repo = "https://github.com/anthropics/skills";
  // 0.7.32 legal review: brand-guidelines is out (it dresses work in Anthropic's own brand; Apache 2.0 gives no trademark rights).
  const wanted = ["internal-comms", "theme-factory", "frontend-design", "canvas-design", "mcp-builder", "skill-creator", "algorithmic-art", "discernment-nudge"];
  const ok = wanted.filter(d => {
    const lic = path.join(dir, "skills", d, "LICENSE.txt");
    const apache = fs.existsSync(lic) && /Apache License\s+Version 2\.0/.test(fs.readFileSync(lic, "utf8"));
    if (!apache) skipped.push(`anthropic/${d}: no Apache 2.0 LICENSE.txt`);
    else licenses["apache-2.0.txt"] = fs.readFileSync(lic, "utf8");
    return apache;
  });
  SOURCES.push({ id: "anthropic", repo, commit: commitOf(dir), license: "Apache-2.0", copyright: "Copyright Anthropic, PBC", licenseFile: "apache-2.0.txt" });
  // The pack is named for what it does, not with Anthropic's name (no implied endorsement); the author stays credited.
  packs.push({ id: "anthropic", name: "Design and Build", category: "creative", source: "anthropic", author: "Anthropic", license: "Apache-2.0",
    description: "Design, writing and builder skills published as open source (Apache 2.0).", skills: skillsIn(path.join(dir, "skills"), skipped, "anthropic", ok) });
}

// 2. Superpowers by Jesse Vincent (MIT): ways of working for planning, debugging, testing and code review.
{
  const dir = path.join(ROOT, "obra_superpowers"); const repo = "https://github.com/obra/superpowers";
  licenses["superpowers-mit.txt"] = fs.readFileSync(path.join(dir, "LICENSE"), "utf8");
  SOURCES.push({ id: "superpowers", repo, commit: commitOf(dir), license: "MIT", copyright: "Copyright (c) 2025 Jesse Vincent", licenseFile: "superpowers-mit.txt" });
  packs.push({ id: "superpowers", name: "Superpowers", category: "workflows", source: "superpowers", author: "Jesse Vincent", license: "MIT",
    description: "Proven ways of working: brainstorming, writing plans, test-driven development, systematic debugging and code review.",
    skills: skillsIn(path.join(dir, "skills"), skipped, "superpowers") });
}

// 3. wshobson/agents (MIT; a few plugins are Apache 2.0 by other authors): one pack per plugin that has skills.
{
  const dir = path.join(ROOT, "wshobson_agents"); const repo = "https://github.com/wshobson/agents";
  licenses["wshobson-agents-mit.txt"] = fs.readFileSync(path.join(dir, "LICENSE"), "utf8");
  SOURCES.push({ id: "wshobson", repo, commit: commitOf(dir), license: "MIT", copyright: "Copyright (c) 2024 Seth Hobson and contributors", licenseFile: "wshobson-agents-mit.txt" });
  const market = JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin", "marketplace.json"), "utf8")).plugins;
  // 0.7.32 legal review: packs tied to another company's paid service or written to promote it are out, and so is the
  // skill about defeating software protection (anti-circumvention laws such as the DMCA and EU 2001/29/EC art. 6).
  const OUT_PACKS = new Set(["social-publishing", "hermes-tweet", "protect-mcp", "signed-audit-trails", "review-agent-governance"]);
  const OUT_SKILLS = new Set(["anti-reversing-techniques"]);
  for (const p of market) {
    if (OUT_PACKS.has(p.name)) { skipped.push(`wshobson/${p.name}: tied to another company's service`); continue; }
    const license = String(p.license || "MIT");
    if (!OK_LICENSE.test(license)) { skipped.push(`wshobson/${p.name}: licence ${license}`); continue; }
    const skills = skillsIn(path.join(dir, "plugins", p.name, "skills"), skipped, `wshobson/${p.name}`)
      .filter(s => { if (!OUT_SKILLS.has(s.slug)) return true; skipped.push(`wshobson/${p.name}/${s.slug}: bypassing software protection`); return false; });
    if (!skills.length) continue;
    packs.push({ id: `wsh-${p.name}`, name: titleOf(p.name), category: p.category || "development", source: "wshobson",
      author: p.author?.name || "Seth Hobson", license, description: String(p.description || "").slice(0, 400), skills });
  }
}

// 4. K-Dense scientific skills (MIT): one pack.
{
  const dir = path.join(ROOT, "K-Dense-AI_claude-scientific-skills"); const repo = "https://github.com/K-Dense-AI/claude-scientific-skills";
  licenses["k-dense-mit.txt"] = fs.readFileSync(path.join(dir, "LICENSE.md"), "utf8");
  SOURCES.push({ id: "kdense", repo, commit: commitOf(dir), license: "MIT", copyright: "Copyright (c) 2025 K-Dense Inc.", licenseFile: "k-dense-mit.txt" });
  packs.push({ id: "science", name: "Science", category: "science", source: "kdense", author: "K-Dense Inc.", license: "MIT",
    description: "Research skills for biology, chemistry, medicine, data analysis and scientific writing.",
    // 0.7.32 legal review: out the skills built on models or data that are free only for non-commercial use.
    skills: skillsIn(path.join(dir, "skills"), skipped, "kdense").filter(s => {
      if (!["alphagenome", "timesfm-forecasting"].includes(s.slug)) return true;
      skipped.push(`kdense/${s.slug}: built on a model or data licensed for non-commercial use only`); return false;
    }) });
}

// 5. ComposioHQ/awesome-claude-skills: left out in the 0.7.32 legal review. The repository has no LICENSE file (only a line
// in its README) and its skills do not say who wrote them, so the right to publish them cannot be shown.
skipped.push("ComposioHQ/awesome-claude-skills: no LICENSE file in the repository and no author per skill");

// 6. Anthropic's knowledge-work and financial-services plugins (0.7.33, Apache 2.0, each plugin folder checked).
// Left out: partner-built plugins (other companies' code for their own services), Cowork-only and viewer plugins.
// A skill whose text is the same as one already in the library is not added twice.
const seenText = new Set(packs.flatMap(p => p.skills.map(s => s.instructions)));
function anthropicPlugins(repoDir, repo, sourceId, folders, idPrefix, category) {
  const root = path.join(ROOT, repoDir);
  const rootLicence = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
  if (!/Apache License\s+Version 2\.0/.test(rootLicence)) throw new Error(`${repoDir} is not Apache 2.0`);
  licenses["apache-2.0.txt"] = licenses["apache-2.0.txt"] || rootLicence;
  SOURCES.push({ id: sourceId, repo, commit: commitOf(root), license: "Apache-2.0", copyright: "Copyright Anthropic, PBC", licenseFile: "apache-2.0.txt" });
  for (const [folder, name] of folders) {
    const dir = path.join(root, folder);
    const own = ["LICENSE", "LICENSE.txt"].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    if (own && !/Apache License\s+Version 2\.0/.test(fs.readFileSync(own, "utf8"))) { skipped.push(`${sourceId}/${name}: own licence is not Apache 2.0`); continue; }
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin", "plugin.json"), "utf8")); } catch {}
    const skills = skillsIn(path.join(dir, "skills"), skipped, `${sourceId}/${name}`).filter(sk => {
      const lic = path.join(dir, "skills", sk.slug, "LICENSE.txt");
      if (fs.existsSync(lic) && !/Apache License\s+Version 2\.0/.test(fs.readFileSync(lic, "utf8"))) { skipped.push(`${sourceId}/${name}/${sk.slug}: own licence is not Apache 2.0`); return false; }
      if (seenText.has(sk.instructions)) return false;
      seenText.add(sk.instructions); return true;
    });
    if (!skills.length) continue;
    packs.push({ id: `${idPrefix}-${name}`, name: titleOf(name), category, source: sourceId, author: "Anthropic", license: "Apache-2.0",
      description: String(meta.description || "").replace(/\bClaude\b/g, "the AI").slice(0, 400), skills });
  }
}
{
  const kw = "anthropics_knowledge-work-plugins";
  const out = new Set(["partner-built", "cowork-plugin-management", "pdf-viewer"]);
  const folders = fs.readdirSync(path.join(ROOT, kw)).filter(d => !out.has(d) && fs.existsSync(path.join(ROOT, kw, d, "skills"))).sort().map(d => [d, d]);
  for (const d of out) skipped.push(`knowledge-work/${d}: ${d === "partner-built" ? "other companies' plugins for their own services" : "made for Anthropic's own apps"}`);
  anthropicPlugins(kw, "https://github.com/anthropics/knowledge-work-plugins", "knowledgework", folders, "kw", "business");
  const fs2 = "anthropics_financial-services-plugins", base = path.join(ROOT, fs2, "plugins");
  const fin = ["vertical-plugins", "agent-plugins"].flatMap(g => fs.readdirSync(path.join(base, g)).sort().map(d => [`plugins/${g}/${d}`, d]));
  skipped.push("financial-services/partner-built (LSEG, S&P Global): other companies' plugins for their own paid data");
  anthropicPlugins(fs2, "https://github.com/anthropics/financial-services-plugins", "financialservices", fin, "fin", "finance");
}

// Slugs must be unique across the whole library and fit the /command limit of 32 characters.
const seen = new Set();
for (const pack of packs) for (const s of pack.skills) {
  let slug = s.slug.slice(0, 32).replace(/-+$/, ""); let n = 2;
  while (seen.has(slug)) slug = `${s.slug.slice(0, 29).replace(/-+$/, "")}-${n++}`;
  seen.add(slug); s.slug = slug;
}

fs.mkdirSync(path.join(OUT, "licenses"), { recursive: true });
for (const [name, text] of Object.entries(licenses)) fs.writeFileSync(path.join(OUT, "licenses", name), text);
fs.writeFileSync(path.join(OUT, "library.json"), JSON.stringify({ version: 1, sources: SOURCES, packs }));
const notice = ["# Skill library — third-party notices", "",
  "The skill packs in library.json are copied from the open-source repositories below, each under its own licence.",
  "Each skill's front matter was removed and its slug shortened where needed; the instructions are otherwise unchanged.", "",
  ...SOURCES.filter(s => s.repo).map(s => `- ${s.repo} (commit ${s.commit}) — ${s.license}, ${s.copyright}. Licence text: licenses/${s.licenseFile}`), "",
  "The Serasmart packs (apps/desktop/skills) are written by Serasmart AI (SeranoConsult SRL) and are not copied from any other source.", "",
  "Packs by authors other than the repository owner (same licence as their pack):", "",
  ...packs.filter(p => p.source === "wshobson" && p.author !== "Seth Hobson").map(p => `- ${p.name}: ${p.author}, ${p.license}`), "",
  "Left out on purpose:", "", ...skipped.map(s => `- ${s}`), ""].join("\n");
fs.writeFileSync(path.join(OUT, "NOTICE.md"), notice);
const total = packs.reduce((n, p) => n + p.skills.length, 0);
console.log(`${packs.length} packs, ${total} skills, ${skipped.length} left out`);
