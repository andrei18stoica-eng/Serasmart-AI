// Skills (0.7.18): reusable instructions an account saves once and calls with /name in the chat (or keeps always on).
// They did not exist before. A skill only adds instructions to the conversation; it never runs code or calls a service.
// 0.7.31: a library of open-source skills (lib/skill-library, built by scripts/build-skill-library.cjs). An account adds a
// whole pack (a plugin: several skills, counted as one) or single skills; their text stays in the library, not in the store.
const path = require("path");

const MAX_SKILLS = 200; // 50 until 0.7.31 (the Pro x2 plan allows 100)
const MAX_ACTIVE = 4;
const MAX_INSTRUCTIONS = 40000; // 8000 until 0.7.31; library skills are longer

// Ready-made skills, added with one click; each account edits its own copy.
const SKILL_TEMPLATES = [
  { slug: "email", name: "Email profesional", description: "Scrie un email clar și politicos, cu subiect, din câteva idei.",
    instructions: "Scrie un email profesional în limba cererii. Începe cu un rând «Subiect: …». Folosește o formulă de adresare potrivită, paragrafe scurte, un ton politicos și ferm, și o încheiere cu semnătura «[Numele tău]». Dacă lipsesc detalii esențiale (destinatar, scop), presupune-le rezonabil și marchează-le între paranteze drepte." },
  { slug: "rezumat", name: "Rezumat", description: "Rezumă un text sau un document în ideile principale.",
    instructions: "Rezumă conținutul primit. Începe cu o propoziție care spune ideea principală, apoi 3–7 puncte cu ce e important (cifre, decizii, termene), apoi, dacă există, «De făcut» cu acțiunile. Nu adăuga informații care nu sunt în text." },
  { slug: "corector", name: "Corector", description: "Corectează gramatica, diacriticele și punctuația, fără să schimbe sensul.",
    instructions: "Corectează textul primit: gramatică, ortografie, diacritice (ș, ț cu virgulă), punctuație, acorduri. Păstrează sensul, tonul și formatarea. Dă întâi textul corectat complet, apoi o listă scurtă cu cele mai importante corecturi." },
  { slug: "traducere", name: "Traducător", description: "Traduce natural, păstrând tonul și formatarea.",
    instructions: "Tradu textul primit în limba cerută (implicit: din română în engleză, iar din altă limbă în română). Traducerea trebuie să sune natural pentru un vorbitor nativ, să păstreze tonul, numele proprii și formatarea. Dă doar traducerea, apoi, dacă e cazul, o notă scurtă despre expresiile greu de tradus." },
  { slug: "social", name: "Postare social media", description: "Postări pentru Instagram, Facebook, LinkedIn sau TikTok.",
    instructions: "Scrie o postare pentru rețeaua cerută (implicit Instagram): un prim rând care atrage atenția, text scurt cu paragrafe de 1–2 rânduri, un îndemn la acțiune și 5–10 hashtaguri relevante. Pentru LinkedIn, ton profesional și fără multe emoji. Oferă două variante." },
  { slug: "simplu", name: "Explică simplu", description: "Explică orice subiect pe înțelesul unui începător.",
    instructions: "Explică subiectul ca pentru cineva care îl aude prima dată: fără jargon (sau explicat imediat), cu o analogie din viața de zi cu zi, un exemplu concret și, la final, ideea de reținut într-o propoziție." },
  { slug: "oferta", name: "Ofertă pentru client", description: "O ofertă de servicii clară, cu etape, preț și termen.",
    instructions: "Redactează o ofertă de servicii: titlu, scurt rezumat al nevoii clientului, ce include (listă), etape și termen, preț (total și ce cuprinde), ce nu include, condiții de plată, valabilitatea ofertei și pasul următor. Unde lipsesc cifre, pune-le între paranteze drepte ca să fie completate." }
];

let LIBRARY = null;
function library() {
  if (!LIBRARY) {
    try { LIBRARY = require(path.join(__dirname, "skill-library", "library.json")); }
    catch { LIBRARY = { sources: [], packs: [] }; }
    LIBRARY.bySlug = new Map(); LIBRARY.byPack = new Map();
    for (const pack of LIBRARY.packs) { LIBRARY.byPack.set(pack.id, pack); for (const s of pack.skills) LIBRARY.bySlug.set(s.slug, { ...s, pack }); }
  }
  return LIBRARY;
}
function librarySkill(slug) { return library().bySlug.get(String(slug || "")) || null; }
function libraryPack(id) { return library().byPack.get(String(id || "")) || null; }
function sourceOf(pack) { return library().sources.find(s => s.id === pack.source) || null; }

// 0.7.32: the attribution and licence texts the MIT and Apache 2.0 licences ask to be shown with the skills.
function libraryNotice() {
  const fs = require("fs"), dir = path.join(__dirname, "skill-library");
  const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
  let names = []; try { names = fs.readdirSync(path.join(dir, "licenses")).sort(); } catch {}
  return { notice: read(path.join(dir, "NOTICE.md")), licenses: names.map(n => ({ name: n, text: read(path.join(dir, "licenses", n)) })) };
}

// The library without the instructions (they are long): what the Extensions pages list.
function libraryIndex() {
  const lib = library();
  return {
    sources: lib.sources.map(({ id, repo, license, copyright }) => ({ id, repo, license, copyright })),
    packs: lib.packs.map(p => ({ id: p.id, name: p.name, description: p.description, category: p.category, author: p.author, license: p.license,
      repo: sourceOf(p)?.repo || "", skills: p.skills.map(s => ({ slug: s.slug, name: s.name, description: s.description })) }))
  };
}

// The skills an account can call: its own, the single library skills it added and the skills of the packs it added.
// Its own slugs win over a library skill with the same slug.
function resolveSkills(items) {
  const own = [], packs = [];
  for (const it of items || []) {
    if (it.kind === "pack") { if (it.enabled !== false) packs.push(it); continue; }
    if (it.library) {
      const lib = librarySkill(it.library);
      if (!lib) continue;
      own.push({ ...it, instructions: it.instructions || lib.instructions, libraryPack: lib.pack });
    } else own.push(it);
  }
  const seen = new Set(own.map(s => String(s.slug).toLowerCase()));
  for (const p of packs) {
    const pack = libraryPack(p.pack); if (!pack) continue;
    for (const s of pack.skills) if (!seen.has(s.slug)) { seen.add(s.slug); own.push({ ...s, enabled: true, auto: false, library: s.slug, libraryPack: pack }); }
  }
  return own;
}

function slugify(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

// {value} with the clean fields, or {error}.
function validateSkill(body = {}, prev = null) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!prev || has("name")) {
    const name = String(body.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (!name) return { error: "Skill-ul are nevoie de un nume." };
    if (name.length > 60) return { error: "Numele poate avea cel mult 60 de caractere." };
    out.name = name;
  }
  if (!prev || has("slug") || has("name")) {
    const slug = slugify(has("slug") && body.slug ? body.slug : out.name || prev?.name);
    if (!slug) return { error: "Comanda skill-ului (/nume) trebuie să conțină litere sau cifre." };
    out.slug = slug;
  }
  if (!prev || has("description")) {
    const d = String(body.description || "").trim();
    if (d.length > 300) return { error: "Descrierea poate avea cel mult 300 de caractere." };
    out.description = d;
  }
  if (!prev || has("instructions")) {
    const i = String(body.instructions || "").trim();
    if (!i) return { error: "Scrie instrucțiunile skill-ului: ce trebuie să facă AI-ul când îl folosești." };
    if (i.length > MAX_INSTRUCTIONS) return { error: `Instrucțiunile pot avea cel mult ${MAX_INSTRUCTIONS} de caractere.` };
    out.instructions = i;
  }
  for (const k of ["enabled", "auto"]) if (has(k)) {
    if (typeof body[k] !== "boolean") return { error: `Câmpul „${k}” trebuie să fie true sau false.` };
    out[k] = body[k];
  }
  return { value: out };
}

// The skills a message calls: "/rezumat" anywhere in it, plus the ones kept always on. At most MAX_ACTIVE.
function skillsForMessage(skills, text) {
  const t = String(text || "");
  const used = new Set((t.match(/(^|\s)\/([a-z0-9-]{1,32})\b/gi) || []).map(x => x.trim().slice(1).toLowerCase()));
  const mine = resolveSkills(skills).filter(s => s.enabled !== false);
  const called = mine.filter(s => used.has(String(s.slug).toLowerCase()));
  const always = mine.filter(s => s.auto && !called.includes(s));
  return [...called, ...always].slice(0, MAX_ACTIVE);
}

function skillSystemText(list) {
  if (!list.length) return "";
  return "SKILL-URI ACTIVE — urmează aceste instrucțiuni salvate de utilizator pentru răspunsul de acum:\n"
    + list.map(s => {
      const from = s.libraryPack ? `\n(Din biblioteca de skill-uri: pachetul «${s.libraryPack.name}», de ${s.libraryPack.author}, licență ${s.libraryPack.license}. Fișierele de lângă skill pomenite în text — scripts/, references/, assets/ — nu sunt disponibile aici: urmează instrucțiunile cu ce ai, fără să pretinzi că le-ai citit sau rulat.)` : "";
      return `### /${s.slug} — ${s.name}${from}\n${s.instructions}`;
    }).join("\n\n");
}

function publicSkill(s) {
  const { userId, ...safe } = s || {};
  const out = { ...safe, enabled: safe.enabled !== false, auto: !!safe.auto };
  if (safe.library) {
    const lib = librarySkill(safe.library);
    if (lib) out.source = { pack: lib.pack.name, author: lib.pack.author, license: lib.pack.license, repo: sourceOf(lib.pack)?.repo || "" };
    if (!safe.instructions && lib) out.instructions = lib.instructions;
  }
  if (safe.kind === "pack") {
    const pack = libraryPack(safe.pack);
    if (pack) Object.assign(out, { name: pack.name, description: pack.description, author: pack.author, license: pack.license, repo: sourceOf(pack)?.repo || "",
      skills: pack.skills.map(x => ({ slug: x.slug, name: x.name })) });
  }
  return out;
}

module.exports = { SKILL_TEMPLATES, MAX_SKILLS, MAX_ACTIVE, MAX_INSTRUCTIONS, library, libraryIndex, libraryNotice, librarySkill, libraryPack, resolveSkills, slugify, validateSkill, skillsForMessage, skillSystemText, publicSkill };
