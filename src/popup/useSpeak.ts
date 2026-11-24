import { useCallback, useEffect, useRef, useState } from "react";
import { sendTtsRequest } from "../content/messaging";

interface SpeakApi {
  /** True while any audio is playing; lets the UI toggle between speak/stop. */
  speaking: boolean;
  /**
   * Identifier of the button/source currently playing (the `id` passed to
   * `speak`). Lets multiple speak buttons show independent states instead of
   * all flipping to "stop" together.
   */
  speakingId: string | null;
  /** Speak `text` in `lang` (BCP-47). No-op for empty text. */
  speak: (text: string, lang: string, id?: string) => void;
  /** Stop any in-progress playback. */
  stop: () => void;
}

// Module-level players so a new request instantly supersedes the previous one
// even across hook instances. A monotonic token guards against stale async work.
let currentAudio: HTMLAudioElement | null = null;
let activeClearState: (() => void) | null = null;
let playToken = 0;

function stopAudio(): void {
  playToken++;
  const clear = activeClearState;
  activeClearState = null;
  clear?.();
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

function speakWebSpeech(text: string, lang: string, token: number, done: () => void): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) {
      done();
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (lang && lang !== "auto") utter.lang = lang;
    utter.onend = () => {
      if (token === playToken) done();
    };
    utter.onerror = () => {
      if (token === playToken) done();
    };
    synth.speak(utter);
  } catch {
    done();
  }
}

/**
 * Read-aloud helper for popup panels. Prefers Google's TTS voice (fetched
 * through the background worker as base64 MP3) and falls back to the Web
 * Speech API when that fails. Mirrors the content-script `speak()` but with a
 * React-friendly `speakingId` so each button can show its own stop state.
 */
export function useSpeak(): SpeakApi {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const onPageHide = () => stopAudio();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", onPageHide);
      stopAudio();
    };
  }, []);

  const stop = useCallback(() => {
    stopAudio();
    if (mountedRef.current) setSpeakingId(null);
  }, []);

  const speak = useCallback((text: string, lang: string, id = "default") => {
    const trimmed = text?.trim();
    if (!trimmed) return;
    stopAudio();
    const token = ++playToken;
    const clearThis = () => {
      if (mountedRef.current) setSpeakingId(null);
    };
    activeClearState = clearThis;
    if (mountedRef.current) setSpeakingId(id);

    const finish = () => {
      if (token === playToken) {
        if (activeClearState === clearThis) activeClearState = null;
        clearThis();
      }
    };

    const fallback = () => {
      if (!mountedRef.current || token !== playToken) return;
      speakWebSpeech(trimmed, lang, token, finish);
    };

    void sendTtsRequest({ type: "tts", text: trimmed, lang })
      .then((res) => {
        if (!mountedRef.current || token !== playToken) return;
        if (res.error || res.audio.length === 0) {
          fallback();
          return;
        }
        let i = 0;
        const playNext = () => {
          if (!mountedRef.current || token !== playToken) return;
          if (i >= res.audio.length) {
            currentAudio = null;
            finish();
            return;
          }
          const audio = new Audio(res.audio[i]);
          currentAudio = audio;
          let handled = false;
          const onChunkFail = () => {
            if (handled || !mountedRef.current || token !== playToken) return;
            handled = true;
            if (i === 0) {
              currentAudio = null;
              fallback();
            } else {
              i++;
              playNext();
            }
          };
          audio.onended = () => {
            if (handled || !mountedRef.current || token !== playToken) return;
            handled = true;
            i++;
            playNext();
          };
          audio.onerror = onChunkFail;
          audio.play().catch(onChunkFail);
        };
        playNext();
      })
      .catch(() => fallback());
  }, []);

  return { speaking: speakingId !== null, speakingId, speak, stop };
}
