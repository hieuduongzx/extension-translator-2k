import { getLanguageEnglishName } from "../languages";
import type { AIProviderConfig } from "../types";
import { chatCompletion, parseAIResult } from "./ai";
import type { TranslateResult } from "./types";

/**
 * Subtitle-aware AI translation for the YouTube "AI" subtitle mode.
 *
 * Unlike page translation, subtitle lines are fragments of continuous speech:
 * a sentence often spans two or three lines and auto-generated captions have
 * no punctuation. So the model gets the preceding lines as read-only context
 * and is told to translate as natural spoken subtitles while keeping exactly
 * one output per input line (the timing of each line stays YouTube's).
 */

/** English name for a caption language code (`en-US` → English, `iw` → Hebrew). */
export function subtitleLanguageName(code: string): string {
  const normalized = code === "iw" ? "he" : code;
  const exact = getLanguageEnglishName(normalized);
  if (exact !== normalized) return exact;
  const base = normalized.split(/[-_]/)[0];
  const byBase = getLanguageEnglishName(base);
  return byBase !== base ? byBase : code;
}

export function buildSubtitlePrompt(
  lines: string[],
  context: string[],
  source: string,
  target: string
): { system: string; user: string } {
  const targetName = subtitleLanguageName(target);
  const from = source && source !== "auto" ? ` from ${subtitleLanguageName(source)}` : "";
  const system =
    `You are a professional subtitle translator. Translate video subtitles${from} into ${targetName}.\n` +
    `The user sends a JSON object: "context" holds the subtitle lines spoken just before ` +
    `(reference only — do NOT translate or output them) and "lines" holds the lines to translate.\n` +
    `Rules:\n` +
    `- Output exactly one translated string per item of "lines", in the same order. ` +
    `Never merge, split, drop or reorder lines.\n` +
    `- The lines are consecutive speech and a sentence may continue across lines. ` +
    `Use the neighbouring lines to understand it, but keep each line's part of the meaning on that line.\n` +
    `- Write natural, concise spoken ${targetName} that reads well as a subtitle, not a word-for-word translation.\n` +
    `- Auto-generated captions may lack punctuation or contain speech-recognition mistakes: infer the intended meaning.\n` +
    `- Keep names, brands and code as appropriate. Translate sound tags such as [Music] briefly, keeping the brackets.\n` +
    `Respond with ONLY a JSON array of ${lines.length} strings. No comments, keys or markdown fences.`;
  const user = JSON.stringify({ context, lines });
  return { system, user };
}

export async function translateSubtitlesAI(
  lines: string[],
  context: string[],
  source: string,
  target: string,
  config: AIProviderConfig
): Promise<TranslateResult> {
  if (lines.length === 0) return { translations: [] };
  if (!config.endpoint) throw new Error("AI provider endpoint is not configured");
  if (!config.model) throw new Error("AI provider model is not configured");
  const { system, user } = buildSubtitlePrompt(lines, context, source, target);
  const content = await chatCompletion(config, system, user);
  return parseAIResult(content, lines);
}
