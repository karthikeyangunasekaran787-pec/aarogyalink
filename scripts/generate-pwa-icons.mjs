/**
 * AarogyaLink — brand artwork + PWA icon generator
 * ----------------------------------------------------------------------------
 * Run with:  bun run icons        (node scripts/generate-pwa-icons.mjs)
 *
 * WHY THIS EXISTS
 *
 * The uploaded brand files (`public/assets/aarogyalink-mark.png` and
 * `aarogyalink-logo-full.png`) were JPEGs with a `.png` name: no alpha channel,
 * and 1536x410 / 1536x1536 pixels while `manifest.webmanifest` declared them as
 * 512x512 `image/png`. Android/Chrome installs the icon and paints its splash
 * from the manifest, so a mismatched, opaque, wrongly-declared image is what
 * produced the blank white home-screen circle and the black square on the
 * splash screen.
 *
 * This script reads that same artwork (never replacing it with different art),
 * removes the white studio background to real transparency, and writes:
 *
 *   public/assets/aarogyalink-mark.png        transparent, square emblem
 *   public/assets/aarogyalink-logo-full.png   transparent, wide lockup
 *   public/icons/icon-{192,512}.png           "any" launcher icons
 *   public/icons/maskable-{192,512}.png       maskable icons (safe zone)
 *   public/icons/apple-touch-icon.png         iOS home screen (opaque)
 *   public/icons/favicon-{32,48}.png          browser tab icons
 *
 * Every output has the exact pixel size the manifest declares and a solid,
 * opaque background where the platform expects one, so the launcher, the
 * generated splash screen and the favicon all render the real emblem.
 *
 * The script is idempotent: it detects JPEG vs PNG, so running it again on its
 * own output keeps the transparency instead of re-keying the artwork.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');

/** Matches `background_color` in the manifest, so the splash blends seamlessly. */
const BACKGROUND = { r: 246, g: 250, b: 251 };

const MARK = path.join(PUBLIC, 'assets/aarogyalink-mark.png');
const FULL = path.join(PUBLIC, 'assets/aarogyalink-logo-full.png');
const ICONS = path.join(PUBLIC, 'icons');

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode a JPEG or PNG file into unpremultiplied RGBA. */
function decode(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.subarray(0, 2).equals(JPEG_SIGNATURE)) {
    const image = jpeg.decode(buffer, { useTArray: true });
    return { width: image.width, height: image.height, data: Buffer.from(image.data) };
  }
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const image = PNG.sync.read(buffer);
    return { width: image.width, height: image.height, data: Buffer.from(image.data) };
  }
  throw new Error(`${file} is neither a JPEG nor a PNG`);
}

const clamp = value => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/**
 * Turn the artwork's flat white studio background into real transparency.
 *
 * A pixel is the artwork `c` composited over white with coverage `a`:
 *   p = a*c + (1-a)*255   →   a = 1 - min(p)/255,  c = (p - min(p)) / a
 * (the artwork is dark blue/teal, so the smallest channel is the white bleed).
 * JPEG noise in the empty background keys to an alpha of 0–3, which is
 * invisible, while anti-aliased edges keep smooth semi-transparent pixels.
 */
function keyOutWhite(image) {
  const { width, height, data } = image;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const min = Math.min(r, g, b);
    const alpha = 255 - min;
    out[i * 4 + 3] = alpha;
    if (alpha === 0) continue;
    const scale = 255 / alpha;
    out[i * 4] = clamp((r - min) * scale);
    out[i * 4 + 1] = clamp((g - min) * scale);
    out[i * 4 + 2] = clamp((b - min) * scale);
  }
  return { width, height, data: out };
}

/** True once the image already carries its own transparency. */
function isTransparent(image) {
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] < 250) return true;
  }
  return false;
}

/** Tight bounds of the visible artwork. */
function alphaBounds(image) {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 32) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('the artwork is fully transparent');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copy a rectangle out of an RGBA image. */
function crop(image, rect) {
  const out = Buffer.alloc(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    image.data.copy(out, y * rect.width * 4, from, from + rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data: out };
}

/**
 * Area-average (box filter) resample. Averaging happens in premultiplied space
 * so transparent pixels never bleed white fringes into the emblem edges.
 */
function resample(image, dw, dh) {
  const { width: sw, height: sh, data } = image;
  const out = Buffer.alloc(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(sh, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(sw, Math.ceil((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * 4;
          const alpha = data[i + 3] / 255;
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += alpha;
          count++;
        }
      }
      const di = (y * dw + x) * 4;
      if (count === 0 || a === 0) continue;
      out[di] = clamp(r / a);
      out[di + 1] = clamp(g / a);
      out[di + 2] = clamp(b / a);
      out[di + 3] = clamp((a / count) * 255);
    }
  }
  return { width: dw, height: dh, data: out };
}

/** Source-over composite of `image` at (dx, dy) onto `canvas`. */
function blend(canvas, image, dx, dy) {
  for (let y = 0; y < image.height; y++) {
    const cy = dy + y;
    if (cy < 0 || cy >= canvas.height) continue;
    for (let x = 0; x < image.width; x++) {
      const cx = dx + x;
      if (cx < 0 || cx >= canvas.width) continue;
      const si = (y * image.width + x) * 4;
      const alpha = image.data[si + 3] / 255;
      if (alpha === 0) continue;
      const di = (cy * canvas.width + cx) * 4;
      for (let c = 0; c < 3; c++) {
        canvas.data[di + c] = clamp(image.data[si + c] * alpha + canvas.data[di + c] * (1 - alpha));
      }
      canvas.data[di + 3] = clamp((alpha + (canvas.data[di + 3] / 255) * (1 - alpha)) * 255);
    }
  }
}

/** Square canvas; `color === null` leaves it fully transparent. */
function solid(size, color) {
  const data = Buffer.alloc(size * size * 4);
  if (!color) return { width: size, height: size, data };
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

/**
 * Square canvas of `size`, with the emblem scaled so its longest edge covers
 * `coverage` of the canvas and centred on it.
 */
function tile(emblem, size, coverage, color) {
  const canvas = solid(size, color);
  const box = Math.round(size * coverage);
  const scale = Math.min(box / emblem.width, box / emblem.height);
  const w = Math.max(1, Math.round(emblem.width * scale));
  const h = Math.max(1, Math.round(emblem.height * scale));
  blend(canvas, resample(emblem, w, h), Math.round((size - w) / 2), Math.round((size - h) / 2));
  return canvas;
}

function write(file, image, opaque = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const png = new PNG({ width: image.width, height: image.height });
  png.data = image.data;
  if (opaque) {
    for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: opaque ? 2 : 6 }));
  const kb = (fs.statSync(file).size / 1024).toFixed(1);
  console.log(`  ${path.relative(ROOT, file).padEnd(44)} ${image.width}x${image.height}  ${kb} kB`);
}

// ── The official artwork, keyed to transparency ──────────────────────────────
const rawMark = decode(MARK);
const mark = isTransparent(rawMark) ? rawMark : keyOutWhite(rawMark);
const rawFull = decode(FULL);
const full = isTransparent(rawFull) ? rawFull : keyOutWhite(rawFull);

// Crop the emblem to its own bounds so it is centred in every icon instead of
// inheriting the JPEG's asymmetric margins.
const markBounds = alphaBounds(mark);
const pad = Math.round(Math.max(markBounds.width, markBounds.height) * 0.03);
const startX = Math.max(0, markBounds.x - pad);
const startY = Math.max(0, markBounds.y - pad);
const emblem = crop(mark, {
  x: startX,
  y: startY,
  width: Math.min(mark.width - startX, markBounds.width + pad * 2),
  height: Math.min(mark.height - startY, markBounds.height + pad * 2),
});

console.log('Brand artwork (transparent PNG, in-app)');
write(MARK, tile(emblem, 1024, 0.96, null));
write(FULL, full);

console.log('PWA + launcher icons');
// "any": the launcher shows the icon as-is, so the emblem can be large.
write(path.join(ICONS, 'icon-192.png'), tile(emblem, 192, 0.86, BACKGROUND), true);
write(path.join(ICONS, 'icon-512.png'), tile(emblem, 512, 0.86, BACKGROUND), true);
// "maskable": Android crops to a circle; the emblem must sit inside the 80%
// safe zone, so its box is kept inside the inscribed square (≈57% of the tile).
write(path.join(ICONS, 'maskable-192.png'), tile(emblem, 192, 0.56, BACKGROUND), true);
write(path.join(ICONS, 'maskable-512.png'), tile(emblem, 512, 0.56, BACKGROUND), true);
// iOS ignores transparency and masks the icon itself: opaque, generous padding.
write(path.join(ICONS, 'apple-touch-icon.png'), tile(emblem, 180, 0.8, BACKGROUND), true);

console.log('Favicons');
write(path.join(ICONS, 'favicon-32.png'), tile(emblem, 32, 0.98, BACKGROUND), true);
write(path.join(ICONS, 'favicon-48.png'), tile(emblem, 48, 0.98, BACKGROUND), true);
