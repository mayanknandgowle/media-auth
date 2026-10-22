import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Original checked-in lossless pixels and synthetic EXIF; no new encoder/dependency.
const webp = await readFile(new URL('../tests/fixtures/lossless.webp', import.meta.url));
assert.equal(webp.toString('ascii', 12, 16), 'VP8L');
for (const order of ['little', 'big']) {
  const jpeg = await readFile(
    new URL(`../tests/fixtures/metadata/exif-${order}.jpg`, import.meta.url),
  );
  assert.equal(jpeg.readUInt16BE(2), 0xffe1);
  assert.equal(jpeg.toString('ascii', 6, 12), 'Exif\0\0');
  const tiff = jpeg.subarray(12, 4 + jpeg.readUInt16BE(4));
  const extended = Buffer.alloc(18);
  extended.write('VP8X');
  extended.writeUInt32LE(10, 4);
  extended[8] = 8;
  extended.writeUIntLE(15, 12, 3);
  extended.writeUIntLE(7, 15, 3);
  const exif = Buffer.alloc(8 + tiff.length + (tiff.length % 2));
  exif.write('EXIF');
  exif.writeUInt32LE(tiff.length, 4);
  exif.set(tiff, 8);
  const header = Buffer.from('RIFF0000WEBP');
  const bytes = Buffer.concat([header, extended, webp.subarray(12), exif]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  const name = `exif-${order}.webp`;
  await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
