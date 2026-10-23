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

// 1. Anthropic's skills: only the ones whose own LICENSE.txt is Apache 2.0. docx, pdf, pptx and xlsx are
// "All rights reserved" (source-available, not open source) and doc-coauthoring has no licence file: left out.
{
  const dir = path.join(ROOT, "anthropics_skills"); const repo = "https://github.com/anthropics/skills";
  const wanted = ["brand-guidelines", "internal-comms", "theme-factory", "frontend-design", "canvas-design", "mcp-builder", "skill-creator", "algorithmic-art", "discernment-nudge"];
  const ok = wanted.filter(d => {
    const lic = path.join(dir, "skills", d, "LICENSE.txt");
    const apache = fs.existsSync(lic) && /Apache License\s+Version 2\.0/.test(fs.readFileSync(lic, "utf8"));
    if (!apache) skipped.push(`anthropic/${d}: no Apache 2.0 LICENSE.txt`);
    else licenses["apache-2.0.txt"] = fs.readFileSync(lic, "utf8");
    return apache;
  });
  SOURCES.push({ id: "anthropic", repo, commit: commitOf(dir), license: "Apache-2.0", copyright: "Copyright Anthropic, PBC", licenseFile: "apache-2.0.txt" });
  packs.push({ id: "anthropic", name: "Anthropic Skills", category: "creative", source: "anthropic", author: "Anthropic", license: "Apache-2.0",
    description: "Design, brand, writing and builder skills published by Anthropic as open source.", skills: skillsIn(path.join(dir, "skills"), skipped, "anthropic", ok) });
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
  for (const p of market) {
    const license = String(p.license || "MIT");
    if (!OK_LICENSE.test(license)) { skipped.push(`wshobson/${p.name}: licence ${license}`); continue; }
    const skills = skillsIn(path.join(dir, "plugins", p.name, "skills"), skipped, `wshobson/${p.name}`);
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
    skills: skillsIn(path.join(dir, "skills"), skipped, "kdense") });
}

// 5. ComposioHQ/awesome-claude-skills (Apache 2.0): only Composio's own skills at the top of the repository.
// Left out: the copies of Anthropic's skills, the 832 skills that need Composio's own service, the skills that
// point at another licence (AGPL, missing LICENSE.txt) and the video downloader.
{
  const dir = path.join(ROOT, "ComposioHQ_awesome-claude-skills"); const repo = "https://github.com/ComposioHQ/awesome-claude-skills";
  SOURCES.push({ id: "composio", repo, commit: commitOf(dir), license: "Apache-2.0", copyright: "Copyright ComposioHQ and contributors", licenseFile: "apache-2.0.txt" });
  const own = ["changelog-generator", "competitive-ads-extractor", "content-research-writer", "developer-growth-analysis", "domain-name-brainstormer",
    "file-organizer", "image-enhancer", "invoice-organizer", "lead-research-assistant", "meeting-insights-analyzer", "raffle-winner-picker", "tailored-resume-generator"];
  packs.push({ id: "composio", name: "Business Helpers", category: "business", source: "composio", author: "ComposioHQ and contributors", license: "Apache-2.0",
    description: "Everyday business helpers: changelogs, competitor ads, research-backed writing, domain ideas, invoices, leads, meetings and résumés.",
    skills: skillsIn(dir, skipped, "composio", own) });
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
  ...SOURCES.map(s => `- ${s.repo} (commit ${s.commit}) — ${s.license}, ${s.copyright}. Licence text: licenses/${s.licenseFile}`), "",
  "Packs by authors other than the repository owner (same licence as their pack):", "",
  ...packs.filter(p => p.source === "wshobson" && p.author !== "Seth Hobson").map(p => `- ${p.name}: ${p.author}, ${p.license}`), "",
  "Left out on purpose:", "", ...skipped.map(s => `- ${s}`), ""].join("\n");
fs.writeFileSync(path.join(OUT, "NOTICE.md"), notice);
const total = packs.reduce((n, p) => n + p.skills.length, 0);
console.log(`${packs.length} packs, ${total} skills, ${skipped.length} left out`);
