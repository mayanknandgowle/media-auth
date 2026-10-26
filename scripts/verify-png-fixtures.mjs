/* global Image, document */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Independent fixture decode, not a general decodability/authenticity assertion.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  for (const name of [
    'known.png',
    'metadata/exif-little.png',
    'metadata/exif-big.png',
    'metadata/dimensions-match.png',
    'metadata/dimensions-different.png',
  ]) {
    const bytes = await readFile(new URL(`../tests/fixtures/${name}`, import.meta.url));
    const result = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return {
        width: image.width,
        height: image.height,
        pixels: Array.from(context.getImageData(0, 0, image.width, image.height).data),
      };
    }, bytes.toString('base64'));
    if (name === 'known.png') {
      assert.equal(result.width, 1);
      assert.equal(result.height, 1);
      assert.deepEqual(result.pixels, [40, 130, 200, 255]);
    } else {
      // Viewers may apply recorded orientation 6. Both views preserve this flat fixture.
      assert.ok(
        (result.width === 16 && result.height === 8) ||
          ((name.includes('little') || name.includes('dimensions-match')) &&
            result.width === 8 &&
            result.height === 16),
      );
      assert.ok(result.pixels.every((value, i) => value === (i % 4 === 3 ? 255 : 128)));
    }
    console.log(
      `${name}: decoded ${result.width}x${result.height}; all expected RGBA pixels verified`,
    );
  }
  console.log(`Decoder: Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
