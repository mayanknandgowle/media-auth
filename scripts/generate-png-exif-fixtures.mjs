import { readFile, writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Original flat-gray RGBA PNG, with original synthetic fields as raw TIFF before IDAT.
function chunk(type, payload) {
  const out = Buffer.alloc(payload.length + 12);
  out.writeUInt32BE(payload.length);
  out.write(type, 4, 'ascii');
  out.set(payload, 8);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(16);
header.writeUInt32BE(8, 4);
header[8] = 8;
header[9] = 6;
const pixels = Buffer.alloc(8 * (1 + 16 * 4));
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 16; x++) {
    const pos = y * 65 + 1 + x * 4;
    pixels.set([128, 128, 128, 255], pos);
  }
for (const order of ['little', 'big']) {
  const jpeg = await readFile(
    new URL(`../tests/fixtures/metadata/exif-${order}.jpg`, import.meta.url),
  );
  assert.equal(jpeg.readUInt16BE(2), 0xffe1);
  assert.equal(jpeg.toString('ascii', 6, 12), 'Exif\0\0');
  const tiff = jpeg.subarray(12, 4 + jpeg.readUInt16BE(4));
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('eXIf', tiff),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const name = `exif-${order}.png`;
  await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
