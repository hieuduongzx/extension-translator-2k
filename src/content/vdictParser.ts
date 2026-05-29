/**
 * Parses HTML returned by `vdict.com/<word>,1,0,0.html` into our
 * `DictionaryEntry` shape.
 *
 * VDict ships two definition blocks:
 *
 *   #academicDefinition   ← short, dictionary-style. Numbered Vietnamese
 *                           senses grouped by POS.
 *   #friendlyDefinition   ← long, AI-augmented. Includes worked examples
 *                           with English + Vietnamese translation.
 *
 * We use the friendly block as the primary source because it contains
 * paired Anh-Việt examples (most useful for learners), and fall back to
 * the academic block when the friendly block is empty.
 *
 * Audio comes from a `playAudio('<id>', '<dict>')` JavaScript call on the
 * speaker button, which then fetches an MP3 from `tn.vdict.com`. We
 * extract the `id` so the popup can construct a playable URL.
 */
import type { DictionaryEntry } from "../types";

const POS_NORMALISE: Record<string, string> = {
  "danh từ": "danh từ",
  "động từ": "động từ",
  "nội động từ": "nội động từ",
  "ngoại động từ": "ngoại động từ",
  "tính từ": "tính từ",
  "phó từ": "phó từ",
  "trạng từ": "phó từ",
  "đại từ": "đại từ",
  "giới từ": "giới từ",
  "liên từ": "liên từ",
  "mạo từ": "mạo từ",
  "thán từ": "thán từ"
};

export function parseVdictHtml(html: string, word: string): DictionaryEntry[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Word + IPA come from the page header.
  const headerTitle = doc.querySelector(".word-header h1")?.textContent?.trim();
  if (!headerTitle) {
    if (typeof console !== "undefined") {
      console.warn("[web-translator] VDict: no word header for", word);
    }
    return [];
  }

  const phonetic =
    doc.querySelector(".word-header .pronunciation")?.textContent?.trim() ||
    undefined;

  // Try the friendly definition first — it's richer and bilingual.
  const friendly = doc.getElementById("friendlyDefinition");
  let meanings = friendly ? readFriendly(friendly) : [];

  if (meanings.length === 0) {
    const academic = doc.getElementById("academicDefinition");
    if (academic) meanings = readAcademic(academic);
  }

  if (meanings.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[web-translator] VDict: parsed page but extracted 0 meanings for",
        word
      );
    }
    return [];
  }

  return [
    {
      word: headerTitle,
      phonetic,
      audio: undefined, // VDict serves audio via JS; TTS handles it.
      source: "vdict",
      meanings,
      sourceUrl: `https://vdict.com/${encodeURIComponent(word)},1,0,0.html`
    }
  ];
}

interface RawDef {
  definition: string;
  example?: string;
  exampleVi?: string;
}

/**
 * Friendly block layout:
 *
 *   <div class="word-type-section">
 *     <div class="word-type">Định nghĩa</div>
 *     <ol class="meanings-list">
 *       <li class="meaning">
 *         <div class="meaning-value"><strong>Danh từ</strong></div>
 *         <ul class="examples-list">
 *           <li class="example">
 *             <div><strong>Sự bắt đầu</strong>: definition text…</div>
 *           </li>
 *         </ul>
 *       </li>
 *     </ol>
 *
 *     <div class="word-type">Ví dụ sử dụng</div>
 *     <ul class="meanings-list"> … </ul>      ← examples grouped by POS
 *   </div>
 */
function readFriendly(root: HTMLElement): DictionaryEntry["meanings"] {
  const meanings: DictionaryEntry["meanings"] = [];
  const partGroups = new Map<string, RawDef[]>();

  // Pass 1: collect numbered Vietnamese senses keyed by POS.
  const defGroups = root.querySelectorAll<HTMLElement>(".meanings-list > .meaning");
  let currentPos: string | null = null;

  for (const group of Array.from(defGroups)) {
    const posEl = group.querySelector(".meaning-value strong");
    const posText = posEl?.textContent?.trim().toLowerCase() || "";
    if (posText && POS_NORMALISE[posText]) {
      currentPos = POS_NORMALISE[posText];
      const examples = group.querySelectorAll<HTMLElement>(".examples-list .example");
      const defs: RawDef[] = [];
      for (const ex of Array.from(examples)) {
        const def = normaliseText(ex.textContent || "");
        if (def) defs.push({ definition: def });
      }
      if (defs.length > 0) {
        const list = partGroups.get(currentPos) ?? [];
        partGroups.set(currentPos, list.concat(defs));
      }
    } else {
      // No POS strong tag → treat as advanced/idiom row attached to the
      // current POS group.
      const def = normaliseText(
        group.querySelector(".meaning-value")?.textContent || ""
      );
      const exampleEl = group.querySelector<HTMLElement>(".example");
      const exampleText = normaliseText(exampleEl?.textContent || "");
      const { en, vi } = splitBilingualSentence(exampleText);
      if (def && currentPos) {
        const list = partGroups.get(currentPos) ?? [];
        list.push({
          definition: def,
          example: en || undefined,
          exampleVi: vi || undefined
        });
        partGroups.set(currentPos, list);
      }
    }
  }

  // Pass 2: pull bilingual examples from the "Ví dụ sử dụng" sub-block and
  // merge them into the matching POS group, attaching to the first def
  // that doesn't already have an example.
  const allHeadings = root.querySelectorAll<HTMLElement>(".word-type");
  for (const h of Array.from(allHeadings)) {
    const label = h.textContent?.trim().toLowerCase() || "";
    if (!label.startsWith("ví dụ")) continue;
    let cur: Element | null = h.nextElementSibling;
    if (!cur || !cur.classList.contains("meanings-list")) continue;
    const groups = cur.querySelectorAll<HTMLElement>(".meaning");
    for (const g of Array.from(groups)) {
      const posText = g
        .querySelector(".meaning-value strong")
        ?.textContent?.trim()
        .toLowerCase();
      if (!posText) continue;
      const pos = POS_NORMALISE[posText];
      if (!pos) continue;
      const list = partGroups.get(pos) ?? [];
      const examples = g.querySelectorAll<HTMLElement>(".examples-list .example");
      let nextSlot = list.findIndex((d) => !d.example);
      for (const ex of Array.from(examples)) {
        const text = normaliseText(ex.textContent || "");
        const { en, vi } = splitBilingualSentence(text);
        if (!en) continue;
        if (nextSlot < 0 || nextSlot >= list.length) {
          list.push({ definition: "", example: en, exampleVi: vi || undefined });
          nextSlot = list.length;
        } else {
          list[nextSlot] = {
            ...list[nextSlot],
            example: en,
            exampleVi: vi || list[nextSlot].exampleVi
          };
          nextSlot = list.findIndex(
            (d, i) => i > nextSlot! && !d.example
          );
        }
      }
      partGroups.set(pos, list);
    }
  }

  for (const [pos, defs] of partGroups) {
    const cleaned = defs.filter(
      (d) => d.definition.trim().length > 0 || d.example
    );
    if (cleaned.length === 0) continue;
    meanings.push({
      partOfSpeech: pos,
      definitions: cleaned.slice(0, 12),
      synonyms: [],
      antonyms: []
    });
  }
  return meanings;
}

/**
 * Academic block layout:
 *
 *   <div class="word-type-section">
 *     <div class="word-type">danh từ</div>
 *     <ol class="meanings-list">
 *       <li class="meaning">
 *         <div class="meaning-value">sự giật mình</div>
 *       </li>
 *     </ol>
 *   </div>
 */
function readAcademic(root: HTMLElement): DictionaryEntry["meanings"] {
  const meanings: DictionaryEntry["meanings"] = [];
  const sections = root.querySelectorAll<HTMLElement>(".word-type-section");
  for (const section of Array.from(sections)) {
    const posText = section
      .querySelector(".word-type")
      ?.textContent?.trim()
      .toLowerCase();
    if (!posText) continue;
    const pos = POS_NORMALISE[posText] ?? posText;
    const defs: RawDef[] = [];
    const items = section.querySelectorAll<HTMLElement>(
      ".meanings-list > .meaning .meaning-value"
    );
    for (const it of Array.from(items)) {
      const def = normaliseText(it.textContent || "");
      if (def) defs.push({ definition: def });
    }
    if (defs.length > 0) {
      meanings.push({
        partOfSpeech: pos,
        definitions: defs,
        synonyms: [],
        antonyms: []
      });
    }
  }
  return meanings;
}

/**
 * Friendly block examples are formatted like:
 *   "The starting of the engine was loud. (Tiếng khởi động của động cơ rất ồn.)"
 * Split on the trailing parenthesised Vietnamese gloss.
 */
function splitBilingualSentence(s: string): { en: string; vi: string } {
  const m = s.match(/^(.*?)\s*\(([^()]*?)\)\s*$/);
  if (m && m[1] && m[2]) {
    return { en: m[1].trim(), vi: m[2].trim() };
  }
  return { en: s.trim(), vi: "" };
}

function normaliseText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}
