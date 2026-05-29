/**
 * Renders the extension icon at 16/32/48/128 px from a single SVG source.
 *
 * Run: `node scripts/generate-icons.mjs`
 *
 * Design: rounded square in the project's brand teal gradient
 * (Tailwind teal-500 → teal-600, matching `tailwind.config.ts`) with a
 * stylised "A 文" pair (Latin → CJK) and an arrow underline — reads as
 * "translation" without any language-specific text.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "icons");

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14b8a6"/>
      <stop offset="100%" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" ry="28" fill="url(#bg)"/>
  <g font-family="Segoe UI, Inter, system-ui, sans-serif" font-weight="700" fill="#ffffff">
    <text x="34" y="74" text-anchor="middle" font-size="64" letter-spacing="-1">A</text>
  </g>
  <g font-family="Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif" font-weight="700" fill="#ccfbf1">
    <text x="86" y="84" text-anchor="middle" font-size="56">文</text>
  </g>
  ${
    size >= 32
      ? `<g stroke="#ffffff" stroke-opacity="0.85" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none">
           <path d="M28 104 L100 104"/>
           <path d="M88 96 L100 104 L88 112"/>
         </g>`
      : ""
  }
</svg>`;

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const out = resolve(outDir, `icon-${size}.png`);
    const buf = await sharp(Buffer.from(svg(size)))
      .resize(size, size)
      .png()
      .toBuffer();
    await writeFile(out, buf);
    console.log(`generated ${out} (${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
