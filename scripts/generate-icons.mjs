/**
 * Renders the extension icon at 16/32/48/128 px from `public/icons/Translator2k.svg`.
 *
 * Run: `node scripts/generate-icons.mjs`
 *
 * Design: *2k family dark squircle (#2c2c31 → #121214, rx=224/1024) matching
 * TubeDeck2k, paired with layered translation cards — a vibrant emerald-teal
 * accent card ("文") behind a crisp white foreground card ("A").
 */
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "public", "icons");
const svgPath = resolve(outDir, "Translator2k.svg");

async function main() {
  await mkdir(outDir, { recursive: true });
  const svgBuffer = await readFile(svgPath);
  for (const size of [16, 32, 48, 128]) {
    const out = resolve(outDir, `icon-${size}.png`);
    const buf = await sharp(svgBuffer, { density: 300 })
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(out, buf);
    console.log(`generated ${out} (${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
