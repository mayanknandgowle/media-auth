import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Original packets from our JPEG fixtures, carried raw in static WebP beside original EXIF.
for (const [variant, order] of [
  ['attributes', 'little'],
  ['elements', 'big'],
]) {
  const jpeg = await readFile(
    new URL(`../tests/fixtures/metadata/xmp-${variant}.jpg`, import.meta.url),
  );
  assert.equal(jpeg.subarray(2, 4).toString('hex'), 'ffe1');
  assert.equal(jpeg.subarray(6, 35).toString(), 'http://ns.adobe.com/xap/1.0/\0');
  const packet = jpeg.subarray(35, 4 + jpeg.readUInt16BE(4));
  const webp = await readFile(
    new URL(`../tests/fixtures/metadata/exif-${order}.webp`, import.meta.url),
  );
  assert.equal(webp.subarray(12, 16).toString(), 'VP8X');
  const chunk = Buffer.alloc(8 + packet.length + (packet.length % 2));
  chunk.write('XMP ');
  chunk.writeUInt32LE(packet.length, 4);
  chunk.set(packet, 8);
  const bytes = Buffer.concat([webp, chunk]);
  bytes[20] |= 4;
  bytes.writeUInt32LE(bytes.length - 8, 4);
  const name = `xmp-${variant}.webp`;
  await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
