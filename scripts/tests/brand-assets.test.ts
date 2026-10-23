/**
 * Official brand artwork on disk — run with: bun test
 *
 * `src/lib/brand-assets.ts` tries the official PNG first and falls back to the
 * vector lockup, which means a missing, renamed or corrupt upload fails
 * SILENTLY: every screen would quietly keep showing the stand-in artwork and
 * nothing else would notice. These tests read the real files so the official
 * artwork being present, transparent and correctly shaped is an assertion
 * rather than an assumption.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';

import { BRAND_FULL_SOURCES, BRAND_MARK_SOURCES } from '../../src/lib/brand-assets';

/** `/assets/x.png` → <project>/public/assets/x.png */
const publicPath = (src: string) => resolve(import.meta.dir, '../../public', src.replace(/^\//, ''));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngHeader {
  width: number;
  height: number;
  colorType: number;
  endsWithIend: boolean;
}

/** Read only the IHDR chunk and the file tail — no image decoding needed. */
function pngHeader(path: string): PngHeader {
  const buffer = readFileSync(path);
  const isPng =
    buffer.length > 24 &&
    buffer.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buffer.toString('ascii', 12, 16) === 'IHDR';
  if (!isPng) throw new Error(`${path} is not a PNG file`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    // 6 = RGBA, 4 = greyscale + alpha. Anything else has no alpha channel.
    colorType: buffer[25],
    endsWithIend: buffer.subarray(buffer.length - 8).toString('ascii', 0, 4) === 'IEND',
  };
}

describe('official brand artwork', () => {
  test('the PNG is tried before the vector fallback for both lockups', () => {
    expect(BRAND_MARK_SOURCES[0]).toBe('/assets/aarogyalink-mark.png');
    expect(BRAND_FULL_SOURCES[0]).toBe('/assets/aarogyalink-logo-full.png');
    // The fallbacks stay in place so the brand survives a missing file.
    expect(BRAND_MARK_SOURCES).toContain('/assets/aarogyalink-mark.svg');
    expect(BRAND_FULL_SOURCES).toContain('/assets/aarogyalink-logo-full.svg');
  });

  test('every source the brand layer can request exists on disk', () => {
    for (const src of [...BRAND_MARK_SOURCES, ...BRAND_FULL_SOURCES]) {
      expect(existsSync(publicPath(src))).toBe(true);
    }
  });

  test('the uploaded PNGs are intact, transparent and correctly shaped', () => {
    const pngs = ['/assets/aarogyalink-mark.png', '/assets/aarogyalink-logo-full.png'].map(publicPath).map(pngHeader);

    for (const png of pngs) {
      expect(png.endsWithIend).toBe(true);
      // An opaque PNG would draw a white box on the header and the PDF card.
      expect([4, 6]).toContain(png.colorType);
      expect(png.width).toBeGreaterThan(0);
      expect(png.height).toBeGreaterThan(0);
      // Big enough to stay crisp when the lockup is rendered 64 px tall.
      expect(png.height).toBeGreaterThanOrEqual(256);
    }
    const [mark, full] = pngs;

    // The emblem is a square tile (it is drawn at 1:1 in the header and PDF).
    expect(mark.width).toBe(mark.height);
    // The lockup is a wide horizontal composition, not a square badge.
    expect(full.width / full.height).toBeGreaterThan(2);
  });

  test('the artwork is committed at a sane file size', () => {
    for (const src of ['/assets/aarogyalink-mark.png', '/assets/aarogyalink-logo-full.png']) {
      const bytes = statSync(publicPath(src)).size;
      expect(bytes).toBeGreaterThan(10_000);
      expect(bytes).toBeLessThan(3_000_000);
    }
  });
});

/**
 * The installed Android app takes its launcher icon and its splash screen from
 * `manifest.webmanifest`, not from the in-app `<BrandLogo>`. When that manifest
 * declared 512x512 while pointing at JPEG data (1536x410 and 1536x1536) and an
 * SVG wrapper whose canvas was 65,536 x 4,293,001,768 px, Android installed a
 * blank white icon and painted a black square on the splash. These tests hold
 * the declaration and the files together.
 */
describe('installed-app assets', () => {
  const root = (path: string) => resolve(import.meta.dir, '../..', path);
  const manifest = JSON.parse(readFileSync(root('public/manifest.webmanifest'), 'utf8')) as {
    background_color: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
  };

  test('every declared icon is a real PNG at exactly its declared size', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      const file = publicPath(icon.src);
      expect(existsSync(file)).toBe(true);
      const { width, height } = pngHeader(file);
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });

  test('both icon purposes are declared', () => {
    const purposes = manifest.icons.map(icon => icon.purpose);
    expect(purposes).toContain('any');
    // Without a maskable icon Android shrinks the "any" artwork into its own
    // shape, which is what left a small, blank-looking circle on the home screen.
    expect(purposes).toContain('maskable');
  });

  test('the installed icons are opaque and carry the emblem, not an empty tile', () => {
    for (const icon of manifest.icons) {
      const png = PNG.sync.read(readFileSync(publicPath(icon.src)));
      let minAlpha = 255;
      let ink = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        minAlpha = Math.min(minAlpha, png.data[i + 3]);
        // Transparency and washed-out artwork are what made the splash icon
        // read as a black/white square instead of the logo.
        if ((png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3 < 200) ink++;
      }
      expect(minAlpha).toBe(255);
      expect(ink / (png.width * png.height)).toBeGreaterThan(0.05);
    }
  });

  test('the page points at the PNG icons for the tab and the home screen', () => {
    const html = readFileSync(root('index.html'), 'utf8');
    for (const href of [
      '/icons/favicon-32.png',
      '/icons/apple-touch-icon.png',
      '/manifest.webmanifest',
    ]) {
      expect(html).toContain(href);
    }
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('name="theme-color"');
    for (const src of ['/icons/favicon-32.png', '/icons/apple-touch-icon.png']) {
      expect(existsSync(publicPath(src))).toBe(true);
    }
  });
});
