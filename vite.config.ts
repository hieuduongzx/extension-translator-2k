import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

const OUT_DIR = "dist";
const CONTENT_ENTRY = "src/content/index.ts";
const CONTENT_OUTPUT = "assets/content-script.js";

/**
 * CRXJS ships content scripts as a tiny loader that does
 * `import(chrome.runtime.getURL(...))`. Chrome blocks that dynamic import in
 * some frames (YouTube watch pages, live_chat iframes, ...) with
 * "Unsafe attempt to load URL ... Domains, protocols and ports must match",
 * so the content script never runs there. For production builds we bundle the
 * content script into a single classic IIFE file instead and register it in
 * the emitted manifest ourselves. Dev mode keeps CRXJS's HMR loader.
 */
function contentScriptIife(): Plugin {
  return {
    name: "translator2k-content-script-iife",
    apply: "build",
    async closeBundle() {
      await build({
        configFile: false,
        logLevel: "warn",
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        build: {
          outDir: OUT_DIR,
          emptyOutDir: false,
          copyPublicDir: false,
          rollupOptions: {
            input: resolve(__dirname, CONTENT_ENTRY),
            output: {
              format: "iife",
              entryFileNames: CONTENT_OUTPUT,
              inlineDynamicImports: true
            }
          }
        }
      });

      const manifestPath = resolve(__dirname, OUT_DIR, "manifest.json");
      const built = JSON.parse(await readFile(manifestPath, "utf8"));
      built.content_scripts = manifest.content_scripts.map((script) => ({
        ...script,
        js: [CONTENT_OUTPUT]
      }));
      // The IIFE needs no web-accessible chunks; drop the ones CRXJS added for
      // its loader so pages can't fingerprint the extension through them.
      delete built.web_accessible_resources;
      await writeFile(manifestPath, JSON.stringify(built, null, 2));
    }
  };
}

export default defineConfig(({ command }) => {
  const { content_scripts: _contentScripts, ...manifestWithoutContent } = manifest;
  return {
    plugins: [
      react(),
      crx({ manifest: command === "build" ? manifestWithoutContent : manifest }),
      contentScriptIife()
    ],
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true
    }
  };
});
