import { readFile, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

for (const [variant, order] of [
  ['attributes', 'little'],
  ['elements', 'big'],
]) {
  const jpeg = await readFile(
    new URL(`../tests/fixtures/metadata/xmp-${variant}.jpg`, import.meta.url),
  );
  assert.equal(jpeg.subarray(6, 35).toString(), 'http://ns.adobe.com/xap/1.0/\0');
  const packet = jpeg.subarray(35, 4 + jpeg.readUInt16BE(4));
  const payload = Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0'), packet]);
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length);
  chunk.write('iTXt', 4);
  chunk.set(payload, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  const png = await readFile(
    new URL(`../tests/fixtures/metadata/exif-${order}.png`, import.meta.url),
  );
  let insert = png.length - 12;
  if (variant === 'attributes') {
    for (let offset = 8; offset < png.length; offset += png.readUInt32BE(offset) + 12)
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
        insert = offset;
        break;
      }
  }
  const bytes = Buffer.concat([png.subarray(0, insert), chunk, png.subarray(insert)]);
  const name = `xmp-${variant}.png`;
  await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
