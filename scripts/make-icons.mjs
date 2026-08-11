/**
 * Draws the Spotter mark — twin plates, the shared lens lit — and writes every
 * brand asset from it.
 *
 *   npm run icons
 *
 * The mark is geometry, not a file: two overlapping rings in a 120-unit box,
 * the left one `accent`, the right one `accent300`, and the lens where they
 * meet filled at 55%. That is the whole idea — your session, your buddy's, and
 * the part you do together. Because it's geometry, the icons are regenerable:
 * move a colour in `src/design/tokens.ts`, mirror it in PALETTE below, rerun.
 *
 * Rasterised and PNG-encoded here rather than through a library — sharp isn't
 * installed and this project doesn't add native deps for a build-time nicety.
 * 4x4 supersampling per pixel is plenty for shapes made of circles.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repoRoot, 'assets', 'images');
const log = (m) => console.log(`[icons] ${m}`);

/* — the palette, mirrored from src/design/tokens.ts — */

const PALETTE = {
  bg: [0x16, 0x18, 0x26], // BG        #161826
  accent: [0x91, 0x84, 0xd9], // ACCENT    #9184d9  — you
  accent300: [0xd2, 0xce, 0xfd], // accent300 #d2cefd  — your buddy
};

/* — the mark, in a 120-unit box centred on (60, 60) — */

const R = 26; // plate radius
const W = 6; // rim thickness
const A = { x: 46, y: 60 }; // your plate
const B = { x: 74, y: 60 }; // theirs
const LENS_ALPHA = 0.55;

// Bounding box of the drawn mark: the rims stick out half a stroke past R.
const MARK_W = B.x - A.x + 2 * (R + W / 2); // 86
const MARK_H = 2 * (R + W / 2); // 58
const ASPECT = MARK_W / MARK_H;

/**
 * Colour at one sample point, in mark-box units. Painter's order, exactly the
 * order the shapes stack in the design: lens, then your rim, then theirs —
 * which is why the right rim wins where the two cross.
 */
const sample = (ux, uy, mono) => {
  const dA = Math.hypot(ux - A.x, uy - A.y);
  const dB = Math.hypot(ux - B.x, uy - B.y);
  const tint = (c) => (mono ? [255, 255, 255] : c);

  if (Math.abs(dB - R) <= W / 2) return [...tint(PALETTE.accent300), 1];
  if (Math.abs(dA - R) <= W / 2) return [...tint(PALETTE.accent), 1];
  if (dA <= R && dB <= R) return [...tint(PALETTE.accent), LENS_ALPHA];
  return null;
};

/**
 * Render to a non-premultiplied RGBA buffer. `fill` is the mark's width as a
 * fraction of the canvas width; `bg` null leaves it transparent.
 */
const render = ({ w, h, fill, bg = null, mono = false }) => {
  const SS = 4; // samples per pixel, per axis
  const scale = (w * fill) / MARK_W; // fill 0 → no mark, just the background
  const drawMark = fill > 0;
  const cx = w / 2;
  const cy = h / 2;
  const px = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Accumulate premultiplied, or edge pixels blend their colour wrong.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS - cx) / scale + 60;
          const uy = (y + (sy + 0.5) / SS - cy) / scale + 60;

          let [sr, sg, sb, sa] = (drawMark ? sample(ux, uy, mono) : null) ?? [0, 0, 0, 0];
          if (bg) {
            // source-over onto an opaque background
            sr = sr * sa + bg[0] * (1 - sa);
            sg = sg * sa + bg[1] * (1 - sa);
            sb = sb * sa + bg[2] * (1 - sa);
            sa = 1;
          }
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }

      const n = SS * SS;
      const i = (y * w + x) * 4;
      px[i + 3] = Math.round((a / n) * 255);
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
    }
  }
  return px;
};

/* — PNG, colour type 6 (RGBA), no filtering — */

const CRC_TABLE = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

const png = (w, h, px) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha

  // Each scanline is prefixed with its filter type; 0 is "none".
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

/* — the assets — */

// Adaptive-icon layers are 512 square: only the middle ~66% is guaranteed to
// survive the launcher's mask. The mark is wide and low, so what has to clear
// the mask is its radial extent — half its width — not its box diagonal.
// The splash canvas is cropped to the mark's own aspect instead, so `imageWidth`
// in app.json sizes the mark itself rather than empty space around it.
const assets = [
  { file: 'icon.png', w: 1024, h: 1024, fill: 0.66, bg: PALETTE.bg },
  { file: 'android-icon-background.png', w: 512, h: 512, fill: 0, bg: PALETTE.bg },
  { file: 'android-icon-foreground.png', w: 512, h: 512, fill: 0.6 },
  { file: 'android-icon-monochrome.png', w: 432, h: 432, fill: 0.6, mono: true },
  // The status-bar icon. Android keeps only the alpha channel and tints the
  // rest, so this is the same white mark as the monochrome layer — but drawn
  // near the edges, because nothing masks it and 24dp is small enough already.
  { file: 'notification-icon.png', w: 96, h: 96, fill: 0.92, mono: true },
  { file: 'splash-icon.png', w: 512, h: Math.round(512 / ASPECT), fill: 0.92 },
  { file: 'favicon.png', w: 48, h: 48, fill: 0.72, bg: PALETTE.bg },
];

for (const { file, w, h, fill, bg, mono } of assets) {
  const buf = png(w, h, render({ w, h, fill, bg, mono }));
  writeFileSync(path.join(outDir, file), buf);
  log(`${file} — ${w}x${h}, ${(buf.length / 1024).toFixed(1)}KB`);
}

log(`done → ${path.relative(repoRoot, outDir)}`);
