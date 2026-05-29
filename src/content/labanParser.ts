/**
 * Parses HTML from `dict.laban.vn/find?type=1&query=...` into our
 * `DictionaryEntry` shape.
 *
 * The Anh-Việt page is a flat sequence of `<div>` blocks rather than nested
 * structure. Each block carries a class that tells us what it is, e.g.:
 *
 *   <div class="bg-grey bold font-large m-top20"><span>Động từ</span></div>
 *     ← Part-of-speech heading (Vietnamese)
 *
 *   <div class="green bold margin25 m-top15">đi</div>
 *     ← Numbered Vietnamese definition under that POS
 *
 *   <div class="color-light-blue margin25 m-top15">are you going there...</div>
 *     ← English example sentence
 *
 *   <div class="margin25">Anh định đi đến đấy bằng tàu hỏa hay máy bay?</div>
 *     ← Vietnamese translation of the preceding example
 *
 *   <div class="bold dot-blue m-top15">as people (things…) go</div>
 *     ← Idiom / phrasal entry heading
 *
 *   <div class="grey bold margin25 m-top15">so sánh với người (vật) trung bình</div>
 *     ← Idiom definition (treated as a separate sense)
 *
 * We walk the active Anh-Việt tab in document order and build up POS-grouped
 * entries with definitions + paired examples.
 */
import type { DictionaryEntry } from "../types";

interface RawDef {
  definition: string;
  example?: string;
  exampleVi?: string; // example translation in Vietnamese
}

export function parseLabanHtml(html: string, word: string): DictionaryEntry[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Phonetic + headword come from the first visible word_tab_title.
  let phonetic: string | undefined;
  const titleEl = doc.querySelector(".word_tab_title h2");
  if (titleEl) {
    const ipaEl = titleEl.querySelector(".color-black");
    const ipaRaw = ipaEl?.textContent?.trim();
    if (ipaRaw && ipaRaw !== "/" && ipaRaw.length > 1) {
      phonetic = ipaRaw;
    }
  }

  // The Anh-Việt content panel. Laban renders multiple tabs (Anh-Việt /
  // Anh-Anh / Đồng nghĩa / Việt-Anh); we want `rel="0"`.
  const panel =
    doc.querySelector('.slide_content[rel="0"] .content') ||
    doc.querySelector(".slide_content .content") ||
    doc.querySelector("#content_selectable.content");
  if (!panel) {
    if (typeof console !== "undefined") {
      console.warn("[web-translator] Laban: no Anh-Việt panel for", word);
    }
    return [];
  }

  // Skip tracking pixels, scripts, ads, etc.
  panel.querySelectorAll("script, style, iframe").forEach((n) => n.remove());

  const meanings: DictionaryEntry["meanings"] = [];
  let currentPos: string | null = null;
  let currentDefs: RawDef[] = [];
  let pendingDef: RawDef | null = null;

  const flushPos = () => {
    if (pendingDef) {
      currentDefs.push(pendingDef);
      pendingDef = null;
    }
    if (currentPos && currentDefs.length > 0) {
      meanings.push({
        partOfSpeech: currentPos.toLowerCase(),
        definitions: currentDefs.slice(0, 12),
        synonyms: [],
        antonyms: []
      });
    }
    currentDefs = [];
  };

  const blocks = Array.from(panel.children) as HTMLElement[];
  for (const el of blocks) {
    if (el.tagName !== "DIV") continue;
    const cls = el.className;
    const text = normaliseText(el.textContent || "");
    if (!text) continue;

    // Part-of-speech heading.
    if (cls.includes("bg-grey") && cls.includes("font-large")) {
      flushPos();
      currentPos = text;
      continue;
    }

    // Idiom / phrasal heading — treat as a new definition group under the
    // current POS. Definition itself comes in the next `.grey.bold` block.
    if (cls.includes("dot-blue")) {
      if (pendingDef) {
        currentDefs.push(pendingDef);
        pendingDef = null;
      }
      pendingDef = { definition: `[${text}]` };
      continue;
    }

    // Vietnamese definition. Two flavours: top-level (`green bold`) and
    // idiom-attached (`grey bold`). Treat both as a fresh definition.
    if (
      (cls.includes("green") && cls.includes("bold") && cls.includes("margin25")) ||
      (cls.includes("grey") && cls.includes("bold") && cls.includes("margin25"))
    ) {
      if (pendingDef) {
        // The previous definition didn't get an example — flush it.
        // Special case: `[idiom]` markers should merge with the next def.
        if (
          pendingDef.definition.startsWith("[") &&
          pendingDef.definition.endsWith("]") &&
          !pendingDef.example
        ) {
          pendingDef = {
            definition: `${pendingDef.definition} ${text}`
          };
          continue;
        }
        currentDefs.push(pendingDef);
      }
      pendingDef = { definition: text };
      continue;
    }

    // English example.
    if (cls.includes("color-light-blue")) {
      if (!pendingDef) {
        pendingDef = { definition: "" };
      }
      // Prefer the first example for compactness.
      if (!pendingDef.example) {
        pendingDef.example = text;
      }
      continue;
    }

    // Vietnamese translation of preceding example. Laban uses `.margin25`
    // alone (no extra colour class) for these.
    if (
      cls.includes("margin25") &&
      !cls.includes("green") &&
      !cls.includes("grey") &&
      !cls.includes("color-light-blue") &&
      !cls.includes("bold")
    ) {
      if (pendingDef && pendingDef.example && !pendingDef.exampleVi) {
        pendingDef.exampleVi = text;
      }
      continue;
    }
  }

  flushPos();

  if (meanings.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[web-translator] Laban: parsed page but extracted 0 meanings for",
        word
      );
    }
    return [];
  }

  // Squash repeated empty definitions and prefer entries that have either
  // a definition string or an example.
  for (const m of meanings) {
    m.definitions = m.definitions.filter(
      (d) => d.definition.trim().length > 0 || d.example
    );
  }

  return [
    {
      word,
      phonetic,
      audio: undefined, // Laban audio is JS-driven; we fall back to TTS.
      source: "laban",
      meanings: meanings.filter((m) => m.definitions.length > 0),
      sourceUrl: `https://dict.laban.vn/find?type=1&query=${encodeURIComponent(word)}`
    }
  ];
}

function normaliseText(s: string): string {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}
