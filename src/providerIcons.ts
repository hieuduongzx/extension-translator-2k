import { BUILTIN_PROVIDER_LABELS, type ProviderId } from "./types";

/* ────────────────────────────────────────────────────────────────────────────
   Shared SVG icon strings — used by the content-script selection popup
   (plain DOM) and re-exported as React components by the popup UI.

   Keeping every icon as a single inline SVG string keeps the extension
   offline-friendly, resolution-independent, and avoids asset-copy build steps.
   ──────────────────────────────────────────────────────────────────────────── */

const GOOGLE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16.1 18.9 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.5-5.2l-6.2-5.3c-2.1 1.4-4.6 2.2-7.3 2.2-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.5l6.2 5.3C41 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>`;

const BING_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="wt-bing-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#36c5f0"/><stop offset="100%" stop-color="#0078d4"/></linearGradient></defs><path fill="url(#wt-bing-grad)" d="M5 3v22.6l6.5-2.7v-12L20 14l-3 1.3 5 2.2 6 2.5L11.5 28 5 25.7V3z"/></svg>`;

const GEMMA_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"/><defs><linearGradient id="wt-gem-0" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"/><stop offset="1" stop-color="#08B962" stop-opacity="0"/></linearGradient><linearGradient id="wt-gem-1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"/><stop offset="1" stop-color="#F94543" stop-opacity="0"/></linearGradient><linearGradient id="wt-gem-2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"/><stop offset=".46" stop-color="#FABC12" stop-opacity="0"/></linearGradient></defs></svg>`;

const CUSTOM_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><path d="M12 2v4M8 18v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"/></svg>`;

/** Map a provider id to an SVG icon HTML string. */
export function providerIcon(providerId: ProviderId | string): string {
  switch (providerId) {
    case "google":
      return GOOGLE_ICON_SVG;
    case "bing":
      return BING_ICON_SVG;
    case "gemma":
      return GEMMA_ICON_SVG;
    default:
      return CUSTOM_ICON_SVG;
  }
}

/**
 * Re-export the display label for a provider. Used by the selection popup
 * so it doesn't duplicate the strings already defined in `types.ts`.
 */
export { BUILTIN_PROVIDER_LABELS };
