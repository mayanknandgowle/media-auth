/* global Image, document */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  for (const name of ['rgb24-bottom-up.bmp', 'rgb24-top-down.bmp']) {
    const bytes = await readFile(new URL(`../tests/fixtures/${name}`, import.meta.url));
    const result = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/bmp;base64,${base64}`;
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
    assert.equal(result.width, 3);
    assert.equal(result.height, 2);
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 3; x++) {
        const offset = (y * 3 + x) * 4;
        assert.deepEqual(result.pixels.slice(offset, offset + 4), [
          40 + 60 * x,
          30 + 90 * y,
          200 - 40 * x,
          255,
        ]);
      }
    console.log(`${name}: decoded 3x2; all RGB/row-order/padding expectations match`);
  }
  console.log(`Decoder: Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
