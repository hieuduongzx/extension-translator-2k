/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMMA_ENDPOINT?: string;
  readonly VITE_GEMMA_API_KEY?: string;
  readonly VITE_GEMMA_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
