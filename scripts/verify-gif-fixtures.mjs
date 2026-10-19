/* global Image, document */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// An independent decoder validates our fixtures, not general probe decodability.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  for (const name of ['single87.gif', 'transparent-interlaced.gif']) {
    const bytes = await readFile(new URL(`../tests/fixtures/${name}`, import.meta.url));
    const result = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/gif;base64,${base64}`;
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
    const transparent = name === 'transparent-interlaced.gif';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        const expected =
          (x + y) % 2 === 0 ? [128, 128, 128, 255] : transparent ? [0, 0, 0, 0] : [0, 96, 255, 255];
        const offset = (y * 16 + x) * 4;
        assert.deepEqual(result.pixels.slice(offset, offset + 4), expected);
      }
    }
    console.log(`${name}: decoded 16x8; all checkerboard RGBA pixels match`);
  }
  console.log(`Decoder: Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
