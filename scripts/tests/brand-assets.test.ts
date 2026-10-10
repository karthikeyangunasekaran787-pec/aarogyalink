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
