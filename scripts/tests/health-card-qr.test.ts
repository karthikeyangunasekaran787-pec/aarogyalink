/**
 * Runtime checks for the Health Card deliverables — run with: bun test
 *
 *   • the QR printed on the card is decoded by the SAME library the doctor's
 *     camera scanner uses (a round trip through the encoder/decoder pair), and
 *   • the downloadable PDF is actually produced.
 *
 * This is the closest we can get to pressing Download in a browser: both
 * libraries are exercised for real, not asserted from memory.
 */
import { describe, expect, test } from 'bun:test';
import QRCodeEncoder from 'qrcode';
import jsQR from 'jsqr';

import { healthCardQrPayload, parseHealthCardQr } from '../../src/lib/health-card';
import { buildHealthCardPdf } from '../../src/lib/health-card-pdf';

/**
 * Paint a QR matrix into an RGBA frame the way a camera would see it — quiet
 * zone included — so jsQR has to do real detection work.
 */
function frameFromPayload(payload: string, scale = 4, quiet = 4) {
  const qr = QRCodeEncoder.create(payload, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const size = modules.size;
  const side = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4);
  data.fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = ((y + quiet) * scale + dy) * side + ((x + quiet) * scale + dx);
          data[px * 4] = 15;
          data[px * 4 + 1] = 23;
          data[px * 4 + 2] = 42;
          data[px * 4 + 3] = 255;
        }
      }
    }
  }
  return { data, width: side, height: side };
}

describe('Health Card QR', () => {
  test('the card QR is decoded by the scanner and yields the card reference', () => {
    const payload = healthCardQrPayload('AL-PT-2026-001');
    const frame = frameFromPayload(payload);
    const decoded = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' });

    expect(decoded).not.toBeNull();
    expect(decoded?.data).toBe(payload);
    // …and the app turns that back into the reference the backend verifies.
    expect(parseHealthCardQr(decoded!.data)).toBe('AL-PT-2026-001');
  });

  test('the QR never carries medical data', () => {
    const payload = healthCardQrPayload('AL-PT-2026-001');
    for (const forbidden of ['diagnosis', 'prescription', 'spO2', 'bloodPressure', 'note']) {
      expect(payload.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('Digital Health Card PDF', () => {
  test('builds a real PDF from stored patient details', async () => {
    const doc = await buildHealthCardPdf({
      name: 'Ravi Kumar',
      healthCardId: 'AL-PT-2026-001',
      age: 42,
      gender: 'male',
      bloodGroup: 'O+',
      facilityName: 'Government Hospital, Pudukkottai',
      emergencyContact: '9000000000',
      village: 'Kallikudi',
      district: 'Pudukkottai',
    });

    const bytes = doc.output('arraybuffer') as ArrayBuffer;
    expect(bytes.byteLength).toBeGreaterThan(2000);
    // A PDF always starts with %PDF and carries a page object.
    const head = new TextDecoder().decode(new Uint8Array(bytes.slice(0, 5)));
    expect(head).toBe('%PDF-');
  });
});
