/// <reference types="vite/client" />

/** Optional overrides for the gateway defaults baked into `src/types.ts`. */
interface ImportMetaEnv {
  readonly VITE_AI_ENDPOINT?: string;
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AUTO_FREE_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
