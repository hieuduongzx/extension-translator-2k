/**
 * Parses Parsoid HTML returned by `vi.wiktionary.org/w/rest.php/v1/page/.../html`
 * into our `DictionaryEntry` shape.
 *
 * Wiktionary articles are structured as:
 *
 *   <h2><span class="lang lang-eng" data-iso="eng">Tiếng Anh</span></h2>
 *   <section>
 *     <h3>Cách phát âm</h3>           ← marked by template `-pron-`
 *       <span class="IPA">…</span>
 *       <audio><source src="…mp3"/></audio>
 *   </section>
 *   <section>
 *     <h3>Danh từ</h3>                ← marked by template `-noun-`
 *     <ol> <li>…</li> … </ol>
 *   </section>
 *   …
 *
 * We identify the English subsection by its ISO code (`data-iso="eng"`) and
 * each POS section by the template wikitext stored in the preceding meta
 * element (e.g. `-noun-`, `-tr-verb-`). Falling back to the Vietnamese
 * heading text only when those signals are missing keeps the parser
 * resilient against Unicode normalisation surprises.
 */
import type { DictionaryEntry } from "../types";

/** Wiktionary template name → human readable POS in Vietnamese. */
const POS_TEMPLATES: Record<string, string> = {
  "-noun-": "danh từ",
  "-verb-": "động từ",
  "-tr-verb-": "ngoại động từ",
  "-intr-verb-": "nội động từ",
  "-adj-": "tính từ",
  "-adv-": "phó từ",
  "-pronoun-": "đại từ",
  "-prep-": "giới từ",
  "-conj-": "liên từ",
  "-art-": "mạo từ",
  "-interj-": "thán từ",
  "-num-": "số từ",
  "-prefix-": "tiền tố",
  "-suffix-": "hậu tố",
  "-phrase-": "cụm từ",
  "-idiom-": "thành ngữ"
};

/** Vietnamese heading text → POS, used when the template attribute is missing. */
const POS_HEADINGS: Record<string, string> = {
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
  "quán từ": "mạo từ",
  "thán từ": "thán từ",
  "số từ": "số từ",
  "lượng từ": "lượng từ",
  "cụm từ": "cụm từ",
  "tiền tố": "tiền tố",
  "hậu tố": "hậu tố"
};

export function parseWiktionaryHtml(html: string, word: string): DictionaryEntry[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Find the English language H2. The inner span carries an ISO code which
  // is ASCII and immune to Unicode normalisation issues.
  const langSpan = doc.querySelector('h2 span[data-iso="eng"]');
  const h2 = langSpan?.closest("h2") ?? findH2ByText(doc, "tiếng anh");
  if (!h2) {
    if (typeof console !== "undefined") {
      console.warn("[web-translator] Wiktionary: no Tiếng Anh section for", word);
    }
    return [];
  }

  const sections = collectChildSections(h2);
  if (sections.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[web-translator] Wiktionary: no <h3> subsections for",
        word
      );
    }
    return [];
  }

  let phonetic: string | undefined;
  let audio: string | undefined;
  const meanings: DictionaryEntry["meanings"] = [];

  for (const section of sections) {
    const tpl = section.template;
    const heading = (section.heading.textContent || "").trim().toLowerCase();

    // Pronunciation: `-pron-` template (with a `Cách phát âm` heading).
    if (tpl === "-pron-" || heading === "cách phát âm") {
      const { ipa, mp3 } = readPronunciation(section.body);
      phonetic = phonetic ?? ipa;
      audio = audio ?? mp3;
      continue;
    }

    const pos = (tpl && POS_TEMPLATES[tpl]) || matchPosByHeading(heading);
    if (!pos) continue;
    const definitions = readDefinitions(section.body);
    if (definitions.length === 0) continue;
    meanings.push({
      partOfSpeech: pos,
      definitions,
      synonyms: [],
      antonyms: []
    });
  }

  if (meanings.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[web-translator] Wiktionary: parsed page but extracted 0 meanings for",
        word
      );
    }
    return [];
  }

  return [
    {
      word,
      phonetic,
      audio,
      source: "wiktionary",
      meanings,
      sourceUrl: `https://vi.wiktionary.org/wiki/${encodeURIComponent(word)}`
    }
  ];
}

interface SubSection {
  heading: HTMLElement;
  body: HTMLElement[];
  /** The wikitext template name parsed out of the preceding `<meta data-mw>`. */
  template: string | null;
}

function findH2ByText(doc: Document, target: string): HTMLElement | null {
  return (
    Array.from(doc.querySelectorAll("h2")).find((el) =>
      (el.textContent || "").trim().toLowerCase().startsWith(target)
    ) ?? null
  );
}

/**
 * Walks the English language section and groups subsequent siblings into
 * sub-sections keyed by their `<h3>`. Stops at the next `<h2>` (other
 * language).
 */
function collectChildSections(h2: Element): SubSection[] {
  const result: SubSection[] = [];
  const top: Element = h2.closest("section") ?? h2;
  const all = Array.from(top.querySelectorAll("h3"));
  for (const h3 of all) {
    const body: HTMLElement[] = [];
    let cur: Element | null = h3.nextElementSibling;
    while (cur && cur.tagName !== "H3" && cur.tagName !== "H2") {
      body.push(cur as HTMLElement);
      cur = cur.nextElementSibling;
    }
    result.push({
      heading: h3 as HTMLElement,
      body,
      template: readTemplateName(h3)
    });
  }
  return result;
}

/**
 * Wiktionary inserts `<meta typeof="mw:Transclusion" data-mw='{"parts":[…]}'/>`
 * elements right before each section heading. The wikitext name (e.g.
 * `-noun-`) lives at `parts[0].template.target.wt` and is the canonical POS
 * marker — language-independent and stable across page edits.
 */
function readTemplateName(h3: Element): string | null {
  // Walk preceding siblings up to the previous H3/H2 looking for a meta with
  // mw:Transclusion. Wiktionary commonly places the meta as the previous
  // sibling, but sometimes there are whitespace span/link elements between.
  let cur: Element | null = h3.previousElementSibling;
  let hops = 0;
  while (cur && hops < 6 && cur.tagName !== "H3" && cur.tagName !== "H2") {
    if (cur.tagName === "META") {
      const dataMw = cur.getAttribute("data-mw");
      if (dataMw) {
        try {
          const parsed = JSON.parse(dataMw) as {
            parts?: { template?: { target?: { wt?: string } } }[];
          };
          const wt = parsed.parts?.[0]?.template?.target?.wt;
          if (wt) return wt.trim();
        } catch {
          /* malformed JSON — ignore */
        }
      }
    }
    cur = cur.previousElementSibling;
    hops++;
  }
  return null;
}

function readPronunciation(nodes: HTMLElement[]): { ipa?: string; mp3?: string } {
  const root = wrapNodes(nodes);
  const ipaEl = root.querySelector(".IPA");
  const ipa = ipaEl?.textContent?.trim() || undefined;
  const mp3Source = root.querySelector('audio source[type="audio/mpeg"]') as
    | HTMLSourceElement
    | null;
  const oggSource = root.querySelector('audio source[type^="audio/ogg"]') as
    | HTMLSourceElement
    | null;
  const rawSrc = mp3Source?.src || oggSource?.src;
  const mp3 = rawSrc ? absoluteUrl(rawSrc) : undefined;
  return { ipa, mp3 };
}

function readDefinitions(
  nodes: HTMLElement[]
): { definition: string; example?: string }[] {
  const root = wrapNodes(nodes);
  const ol = root.querySelector("ol");
  if (!ol) return [];

  const out: { definition: string; example?: string }[] = [];
  for (const li of Array.from(ol.children) as HTMLElement[]) {
    if (li.tagName !== "LI") continue;
    cleanInlineNoise(li);

    let example: string | undefined;
    const nestedExample = li.querySelector(
      ":scope > ul > li, :scope > dl > dd"
    );
    if (nestedExample) {
      example = normaliseText(nestedExample.textContent || "") || undefined;
      nestedExample.parentElement?.remove();
    }

    const def = normaliseText(li.textContent || "");
    if (def) out.push({ definition: def, example });
    if (out.length >= 6) break;
  }
  return out;
}

function matchPosByHeading(heading: string): string | null {
  const trimmed = heading.trim().toLowerCase();
  if (!trimmed) return null;
  if (POS_HEADINGS[trimmed]) return POS_HEADINGS[trimmed];
  for (const key of Object.keys(POS_HEADINGS)) {
    if (trimmed.startsWith(key)) return POS_HEADINGS[key];
  }
  return null;
}

function wrapNodes(nodes: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement("div");
  for (const n of nodes) wrapper.appendChild(n.cloneNode(true) as HTMLElement);
  return wrapper;
}

function cleanInlineNoise(el: HTMLElement): void {
  el.querySelectorAll(
    'sup.reference, .mw-editsection, .reference, [typeof="mw:Placeholder/StrippedTag"]'
  ).forEach((n) => n.remove());
}

function normaliseText(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function absoluteUrl(src: string): string {
  if (src.startsWith("//")) return `https:${src}`;
  return src;
}
