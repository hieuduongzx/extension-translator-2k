/**
 * Text-to-speech for the in-page popups.
 *
 * Primary path: Google Translate's public TTS endpoint (the familiar
 * Vietnamese Google voice, and Google voices for other languages),
 * fetched through the background worker and played as MP3 audio. This is the
 * only reliable way to get the Google voice — Chrome does not expose its
 * Google *network* voices to `speechSynthesis.getVoices()` inside a content
 * script, so the Web Speech path would otherwise fall back to a local OS voice.
 *
 * Fallback path: the Web Speech API (`speechSynthesis`), used when the network
 * request fails (offline, rate-limited, restricted page). We still pick the
 * best available local voice there.
 */

import { sendTtsRequest } from "./messaging";

let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoices(): SpeechSynthesisVoice[] {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return cachedVoices;
    const v = synth.getVoices();
    if (v.length) cachedVoices = v;
  } catch {
    /* ignore */
  }
  return cachedVoices;
}

// Warm the cache now and keep it fresh as the browser finishes loading voices.
try {
  window.speechSynthesis?.addEventListener?.("voiceschanged", () => refreshVoices());
  refreshVoices();
} catch {
  /* ignore */
}

// Patterns that identify female / male English voices across platforms
// (Chrome, Windows SAPI, macOS). Word boundaries prevent "male" from matching "female".
const FEMALE_EN_PATTERNS = [
  /\bfemale\b/i,
  /\bgoogle us english\b/i,
  /\bgoogle uk english female\b/i,
  /\bzira\b/i,
  /\baria\b/i,
  /\bjenny\b/i,
  /\bmichelle\b/i,
  /\bsamantha\b/i,
  /\bsusan\b/i,
  /\blinda\b/i,
  /\bhazel\b/i,
  /\beva\b/i,
  /\bsonia\b/i
];
const MALE_EN_PATTERNS = [
  /\bmale\b/i,
  /\bdavid\b/i,
  /\bmark\b/i,
  /\bgeorge\b/i,
  /\bguy\b/i,
  /\bryan\b/i,
  /\bgoogle uk english male\b/i
];

function hasHint(name: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(name));
}

/** True when a voice's BCP-47 lang shares a primary subtag with `base`. */
function langMatches(voiceLang: string, base: string): boolean {
  return voiceLang.toLowerCase().replace("_", "-").split("-")[0] === base;
}

/**
 * Pick the best local voice for `lang` (Web Speech fallback only):
 *  - Vietnamese → a Google voice when available, else the first match.
 *  - English → a female voice (by name heuristic), else a Google voice, else
 *    any non-male voice.
 *  - Other languages → a Google voice when available.
 * Returns `undefined` when no matching voice is installed (caller falls back
 * to the default voice for the utterance's `lang`).
 */
export function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  if (!lang || lang === "auto") return undefined;
  const voices = refreshVoices();
  if (!voices.length) return undefined;

  const base = lang.toLowerCase().split("-")[0];
  const candidates = voices.filter((v) => langMatches(v.lang, base));
  if (!candidates.length) return undefined;

  if (base === "vi") {
    return candidates.find((v) => /google/i.test(v.name)) ?? candidates[0];
  }

  if (base === "en") {
    const female = candidates.find(
      (v) => hasHint(v.name, FEMALE_EN_PATTERNS) && !hasHint(v.name, MALE_EN_PATTERNS)
    );
    if (female) return female;
    const google = candidates.find(
      (v) => /google/i.test(v.name) && !hasHint(v.name, MALE_EN_PATTERNS)
    );
    if (google) return google;
    return candidates.find((v) => !hasHint(v.name, MALE_EN_PATTERNS)) ?? candidates[0];
  }

  return candidates.find((v) => /google/i.test(v.name)) ?? candidates[0];
}

/** The audio element currently playing a Google-TTS sequence, if any. */
let currentAudio: HTMLAudioElement | null = null;
/** Bumped on every `speak`/`stop` so stale async chunks abort themselves. */
let playToken = 0;

/** Speak via the Web Speech API. Returns `false` when unavailable/throws. */
function speakWebSpeech(text: string, lang: string): boolean {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return false;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (lang && lang !== "auto") utter.lang = lang;
    const voice = pickVoice(lang);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    synth.speak(utter);
    return true;
  } catch {
    return false;
  }
}

/** Play an ordered list of audio URLs back-to-back. */
function playSequence(urls: string[], token: number, onFail: () => void): void {
  let i = 0;
  const playNext = () => {
    if (token !== playToken) return; // superseded by a newer speak/stop
    if (i >= urls.length) {
      currentAudio = null;
      return;
    }
    const audio = new Audio(urls[i]);
    currentAudio = audio;
    let handled = false;
    const handleChunkFailure = () => {
      if (handled || token !== playToken) return;
      handled = true;
      // First chunk failing means playback never really started — fall back once.
      if (i === 0) {
        currentAudio = null;
        onFail();
        return;
      }
      i++;
      playNext();
    };
    audio.onended = () => {
      if (handled || token !== playToken) return;
      handled = true;
      i++;
      playNext();
    };
    audio.onerror = handleChunkFailure;
    audio.play().catch(handleChunkFailure);
  };
  playNext();
}

/**
 * Play a single audio URL (e.g. a dictionary pronunciation recording) through
 * the same tracked playback slot as {@link speak}, falling back to TTS if
 * playback fails while this utterance is still active.
 */
export function playAudioUrl(url: string, fallbackText?: string, fallbackLang = "en"): void {
  if (!url) {
    if (fallbackText) speak(fallbackText, fallbackLang);
    return;
  }
  stop();
  const token = ++playToken;
  playSequence([url], token, () => {
    if (token !== playToken || !fallbackText) return;
    speak(fallbackText, fallbackLang);
  });
}

/** Stop any in-progress speech (both Google audio and Web Speech). */
export function stop(): void {
  playToken++;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch {
      /* ignore */
    }
    currentAudio = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Speak `text` in `lang`, preferring the Google voice fetched via the
 * background worker and falling back to the Web Speech API when that fails.
 * Cancels any in-progress utterance first. Returns `false` only when neither
 * path can even start (no audio + no speech synthesis).
 */
export function speak(text: string, lang: string): boolean {
  if (!text) return true;
  stop();
  const token = ++playToken;

  const fallback = () => {
    if (token !== playToken) return;
    speakWebSpeech(text, lang);
  };

  // Kick off the Google TTS fetch; play when it resolves, fall back on failure.
  void sendTtsRequest({ type: "tts", text, lang })
    .then((res) => {
      if (token !== playToken) return; // user moved on / closed popup
      if (res.error || res.audio.length === 0) {
        fallback();
        return;
      }
      playSequence(res.audio, token, fallback);
    })
    .catch(() => fallback());

  // We always "started" — either the fetch will play or the fallback will.
  // Report failure only when there is no speech synthesis available at all,
  // which the fallback itself would surface; here we optimistically return
  // true so callers don't show an error before the async work runs.
  return true;
}
