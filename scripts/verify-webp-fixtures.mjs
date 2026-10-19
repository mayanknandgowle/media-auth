/* global Image, document */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Independent native decoder: fixture validity only, not general probe decodability.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  for (const name of ['lossy.webp', 'lossless.webp', 'alpha.webp']) {
    const bytes = await readFile(new URL(`../tests/fixtures/${name}`, import.meta.url));
    const result = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/webp;base64,${base64}`;
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
    assert.equal(result.width, 16);
    assert.equal(result.height, 8);
    const alpha = name === 'alpha.webp' ? 128 : 255;
    const tolerance = name === 'lossless.webp' ? 0 : 2;
    assert.ok(
      result.pixels.every((value, i) =>
        i % 4 === 3 ? value === alpha : Math.abs(value - 128) <= tolerance,
      ),
    );
    console.log(`${name}: decoded 16x8; gray 128 +/- ${tolerance}, alpha ${alpha}`);
  }
  console.log(`Decoder: Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
