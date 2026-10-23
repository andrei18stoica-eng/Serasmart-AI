// 0.7.33: "Read aloud" speaks in the language the answer is written in (it always used the dictation language before,
// so a Romanian answer was read with an English voice). Scripts decide first, then letters and common words.

const SCRIPTS = [
  [/[֐-׿]/, "he-IL"], [/[؀-ۿ]/, "ar-SA"], [/[฀-๿]/, "th-TH"], [/[ऀ-ॿ]/, "hi-IN"],
  [/[぀-ヿ]/, "ja-JP"], [/[가-힯]/, "ko-KR"], [/[一-鿿]/, "zh-CN"], [/[Ͱ-Ͽ]/, "el-GR"]
];

// Words that are very common in one language and rare in the others.
const WORDS = {
  "ro-RO": ["și", "în", "este", "sunt", "pentru", "care", "cu", "să", "nu", "mai", "acest", "această", "poți", "foarte", "despre", "după", "unde", "când"],
  "en-US": ["the", "and", "is", "are", "you", "for", "with", "this", "that", "what", "can", "will", "your", "have", "from", "about", "which"],
  "es-ES": ["el", "los", "las", "que", "por", "para", "con", "está", "una", "como", "pero", "más", "muy", "también", "puedes"],
  "fr-FR": ["le", "les", "des", "est", "pour", "avec", "une", "dans", "que", "vous", "pas", "sur", "qui", "très", "aussi"],
  "de-DE": ["der", "die", "das", "und", "ist", "nicht", "mit", "ein", "eine", "für", "auch", "sie", "ich", "wir", "sind"],
  "it-IT": ["il", "che", "di", "della", "sono", "per", "con", "una", "non", "anche", "questo", "molto", "puoi", "gli"],
  "pt-PT": ["não", "uma", "para", "com", "que", "são", "você", "também", "muito", "isso", "está", "pelo"],
  "nl-NL": ["het", "een", "niet", "van", "en", "zijn", "voor", "met", "ook", "wat", "deze", "maar"],
  "pl-PL": ["jest", "nie", "się", "że", "dla", "jak", "ale", "oraz", "który", "przez"],
  "tr-TR": ["ve", "bir", "bu", "için", "ile", "çok", "değil", "olarak", "daha"],
  "hu-HU": ["és", "hogy", "nem", "egy", "az", "van", "meg", "is", "csak"],
  "ru-RU": ["и", "в", "не", "что", "на", "это", "как", "для", "с", "по"],
  "uk-UA": ["і", "та", "що", "не", "це", "для", "як", "від", "є"]
};
const LETTERS = [
  [/[șțăâî]/i, "ro-RO", 3], [/[ñ¿¡]/i, "es-ES", 3], [/[çœ]|[èêë]/i, "fr-FR", 1], [/[äöüß]/i, "de-DE", 2],
  [/[ãõ]/i, "pt-PT", 3], [/[ąęłśżź]/i, "pl-PL", 3], [/[ğış]/i, "tr-TR", 3], [/[őű]/i, "hu-HU", 3], [/[іїєґ]/i, "uk-UA", 4]
];

export function detectSpeechLang(text, fallback = "en-US") {
  const t = String(text || "").slice(0, 4000);
  for (const [re, lang] of SCRIPTS) if (re.test(t)) return lang;
  const words = t.toLowerCase().replace(/[`*_#>\[\]()|~"„”“«».,;:!?0-9\\/-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  const score = {};
  for (const [lang, list] of Object.entries(WORDS)) { const set = new Set(list); score[lang] = words.filter((w) => set.has(w)).length; }
  for (const [re, lang, weight] of LETTERS) { const hits = (t.match(new RegExp(re.source, "gi")) || []).length; if (hits) score[lang] = (score[lang] || 0) + Math.min(hits, 20) * weight / 4; }
  if (/[Ѐ-ӿ]/.test(t)) return (score["uk-UA"] || 0) > (score["ru-RU"] || 0) ? "uk-UA" : "ru-RU";
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : fallback;
}

// The installed voice that speaks this language best: same language and region first, then same language.
export function voiceFor(lang, voices) {
  const list = Array.isArray(voices) ? voices : [];
  const base = String(lang).slice(0, 2).toLowerCase();
  return list.find((v) => String(v.lang).toLowerCase().replace("_", "-") === lang.toLowerCase())
    || list.find((v) => String(v.lang).toLowerCase().startsWith(base))
    || null;
}

// Text as it should be heard: no Markdown marks, code blocks or link addresses.
export function speakableText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•+]\s+/gm, "")
    .replace(/[*_`~>|]/g, "")
    .replace(/\$\$?[^$]*\$\$?/g, " ")
    .replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}
