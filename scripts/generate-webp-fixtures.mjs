/* global document */
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Original solid-color pixels; the pinned Playwright Chromium supplies the encoder.
// Run explicitly, not during installation or tests. Committed bytes are the test baseline.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  for (const [name, alpha, quality, expectedChunk] of [
    ['lossy.webp', 1, 0.75, 'VP8 '],
    ['lossless.webp', 1, 1, 'VP8L'],
    ['alpha.webp', 0.5, 0.75, 'VP8X'],
  ]) {
    const url = await page.evaluate(
      ({ alpha, quality }) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 8;
        const context = canvas.getContext('2d');
        context.fillStyle = `rgba(128,128,128,${alpha})`;
        context.fillRect(0, 0, 16, 8);
        return canvas.toDataURL('image/webp', quality);
      },
      { alpha, quality },
    );
    assert.ok(url.startsWith('data:image/webp;base64,'));
    let bytes = Buffer.from(url.split(',')[1], 'base64');
    // Canvas can include a color profile. Isolate the encoded image for simple fixtures.
    if (expectedChunk !== 'VP8X') {
      let image;
      for (let offset = 12; offset < bytes.length;) {
        const length = bytes.readUInt32LE(offset + 4);
        const end = offset + 8 + length + (length % 2);
        if (bytes.toString('ascii', offset, offset + 4) === expectedChunk)
          image = bytes.subarray(offset, end);
        offset = end;
      }
      assert.ok(image, `Canvas must encode ${expectedChunk}`);
      const header = Buffer.from('RIFF0000WEBP');
      header.writeUInt32LE(image.length + 4, 4);
      bytes = Buffer.concat([header, image]);
    }
    assert.equal(bytes.toString('ascii', 12, 16), expectedChunk);
    await writeFile(new URL(`../tests/fixtures/${name}`, import.meta.url), bytes);
    console.log(
      `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
    );
  }
  console.log(`Encoder: Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
