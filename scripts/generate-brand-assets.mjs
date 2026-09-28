/**
 * Generates the LINK STORE brand mark used in transactional email.
 *
 * Email clients do not render SVG (Gmail strips it, Outlook has no support),
 * so the mark ships as a PNG referenced by absolute URL. This script draws it
 * from scratch — no image dependencies — and writes `public/brand/link-mark.png`.
 *
 * The mark is the platform's own idea: two interlocking rounded links at 45°,
 * the chain-link glyph the whole identity hangs from, on a violet badge from
 * the accent trio. Shapes are signed-distance fields (anti-aliased by 3×3
 * supersampling) and the PNG is assembled byte by byte over node's zlib.
 *
 * Run: `node scripts/generate-brand-assets.mjs`
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 128;
const SUP = 3; // supersampling factor for anti-aliasing

/* ---- Colour: the accent trio, as hex ------------------------------------ */

function oklchToHex(L, C, H) {
  // OKLab → linear sRGB (Björn Ottosson's model), then gamma-encoded.
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const enc = (v) => {
    const clamped = Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    return Math.round(clamped * 255);
  };

  return [enc(r), enc(g), enc(bl)];
}

const DEEP = oklchToHex(0.45, 0.125, 289); // the touch of dark violet
const IRIS = oklchToHex(0.79, 0.105, 292); // light violet — the main accent

/* ---- Shape: two interlocking rounded links at 45° ----------------------- */

/** Signed distance to a rounded rectangle centred on the origin. */
function sdRoundRect(x, y, halfW, halfH, radius) {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

const RAD = Math.PI / 4;
const COS = Math.cos(RAD);
const SIN = Math.sin(RAD);

/**
 * Coverage of the glyph at (x, y) in badge-local units (0…SIZE).
 * Two long rounded links, rotated 45°, offset along their shared axis so they
 * interlock like a chain.
 */
function glyphCoverage(x, y) {
  // Centre the coordinate system on the badge.
  const px = x - SIZE / 2;
  const py = y - SIZE / 2;

  // Rotate into the links' frame.
  const rx = px * COS + py * SIN;
  const ry = -px * SIN + py * COS;

  const halfW = SIZE * 0.235;
  const halfH = SIZE * 0.105;
  const radius = halfH;
  const thickness = SIZE * 0.062;
  const offset = SIZE * 0.155;

  const d1 = Math.abs(sdRoundRect(rx - offset, ry, halfW, halfH, radius)) - thickness / 2;
  const d2 = Math.abs(sdRoundRect(rx + offset, ry, halfW, halfH, radius)) - thickness / 2;
  const d = Math.min(d1, d2);

  // Smooth 1px edge.
  return Math.min(1, Math.max(0, 0.5 - d));
}

/** The violet badge the glyph sits on: a rounded square with a diagonal wash. */
function badgeCoverage(x, y) {
  return Math.min(1, Math.max(0, 0.5 - sdRoundRect(x - SIZE / 2, y - SIZE / 2, SIZE / 2 - 1, SIZE / 2 - 1, SIZE * 0.22)));
}

/* ---- Render -------------------------------------------------------------- */

const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let badge = 0;
    let glyph = 0;

    for (let sy = 0; sy < SUP; sy++) {
      for (let sx = 0; sx < SUP; sx++) {
        const px = x + (sx + 0.5) / SUP;
        const py = y + (sy + 0.5) / SUP;
        badge += badgeCoverage(px, py);
        glyph += glyphCoverage(px, py);
      }
    }

    badge /= SUP * SUP;
    glyph /= SUP * SUP;

    // The badge's wash: deep violet at the top-left, light violet at the
    // bottom-right — the accent trio travelling across the mark, as it does
    // along the platform's edges.
    const t = Math.min(1, Math.max(0, (x + y) / (2 * SIZE)));
    const br = Math.round(DEEP[0] + (IRIS[0] - DEEP[0]) * t);
    const bg = Math.round(DEEP[1] + (IRIS[1] - DEEP[1]) * t);
    const bb = Math.round(DEEP[2] + (IRIS[2] - DEEP[2]) * t);

    // Glyph in snow, composited over the badge; transparent outside it.
    const a = badge;
    const r = Math.round(br + (250 - br) * glyph);
    const g = Math.round(bg + (250 - bg) * glyph);
    const b = Math.round(bb + (250 - bb) * glyph);

    const i = (y * SIZE + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = Math.round(a * 255);
  }
}

/* ---- PNG assembly -------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

// Scanlines, each prefixed by its filter byte (0 = none).
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "brand", "link-mark.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
