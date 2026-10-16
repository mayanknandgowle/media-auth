/* global Image, document */
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Independent codec check for the original fixtures, not a claim about the probe's decoder.
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  for (const name of ['baseline.jpg', 'progressive.jpg']) {
    const bytes = await readFile(new URL(`../tests/fixtures/${name}`, import.meta.url));
    const result = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${base64}`;
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
    assert.ok(result.pixels.every((value, i) => value === (i % 4 === 3 ? 255 : 128)));
    console.log(`${name}: decoded 16x8; all pixels RGBA(128,128,128,255)`);
  }
  console.log(`Decoder: Chromium ${browser.version()}`);
} finally {
  await browser.close();
}
