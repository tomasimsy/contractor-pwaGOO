/**
 * Generates every PWA icon from one inline SVG source.
 *
 * Run with:  node scripts/generate-pwa-icons.mjs
 *
 * Checked in as a script rather than hand-placed binaries so the icon
 * set can be regenerated (new brand colour, tweaked glyph) without
 * anyone needing a design tool, and so the source of truth for the mark
 * is readable text in version control instead of five opaque PNGs.
 *
 * Two variants are produced, and the distinction matters:
 *
 *   "any"      — the glyph fills the canvas. Used where the platform
 *                draws the icon as-is.
 *   "maskable" — the same glyph inset to ~60% of the canvas on a solid
 *                background. Android crops icons to a device-chosen
 *                shape (circle, squircle, teardrop); anything outside
 *                the guaranteed-safe centre circle can be clipped. An
 *                icon that is only declared "any" gets letterboxed
 *                inside a white rounded square on those launchers,
 *                which is the classic "my PWA looks broken on Android"
 *                symptom.
 *
 * apple-touch-icon is a third case: iOS applies its own rounded-corner
 * mask and does NOT support transparency (it composites alpha onto
 * black), so that one is drawn square-edged on an opaque background.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/** Matches --primary in app/globals.css (light theme). */
const BRAND = "#16794f";

/** A roof + rafter mark, drawn in a 0 0 512 512 viewBox.
 * `scale` shrinks the glyph toward the centre for the maskable variant. */
function svg({ scale = 1, rounded = true, background = BRAND }) {
  const inset = (512 * (1 - scale)) / 2;
  const radius = rounded ? 112 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" ry="${radius}" fill="${background}"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})">
    <path d="M256 104 L432 248 L432 280 L256 136 L80 280 L80 248 Z" fill="#ffffff"/>
    <path d="M256 168 L392 280 L392 408 L296 408 L296 320 L216 320 L216 408 L120 408 L120 280 Z"
          fill="#ffffff" fill-opacity="0.92"/>
  </g>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, svg: svg({ scale: 1 }) },
  { file: "icon-512.png", size: 512, svg: svg({ scale: 1 }) },
  // Maskable: glyph inset so Android's crop can never clip it.
  { file: "icon-maskable-192.png", size: 192, svg: svg({ scale: 0.6, rounded: false }) },
  { file: "icon-maskable-512.png", size: 512, svg: svg({ scale: 0.6, rounded: false }) },
  // iOS: square, opaque — Apple masks and does not honour alpha.
  { file: "apple-touch-icon.png", size: 180, svg: svg({ scale: 0.82, rounded: false }) },
];

await mkdir(OUT_DIR, { recursive: true });

for (const target of TARGETS) {
  const png = await sharp(Buffer.from(target.svg))
    .resize(target.size, target.size)
    .png()
    .toBuffer();
  await writeFile(join(OUT_DIR, target.file), png);
  console.log(`wrote ${target.file} (${target.size}x${target.size}, ${png.length} bytes)`);
}

console.log(`\n${TARGETS.length} icons written to public/icons/`);
