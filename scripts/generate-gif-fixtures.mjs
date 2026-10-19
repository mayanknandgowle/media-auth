import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Original 16x8 two-color checkerboards. Clear before each literal keeps every
// LZW code three bits wide; this is intentionally simple, not a general encoder.
const palette = Buffer.from([128, 128, 128, 0, 96, 255]);
for (const transparent of [false, true]) {
  const header = Buffer.alloc(13);
  header.write(transparent ? 'GIF89a' : 'GIF87a');
  header.writeUInt16LE(16, 6);
  header.writeUInt16LE(8, 8);
  header[10] = transparent ? 0 : 0x80;
  const image = Buffer.alloc(10);
  image[0] = 0x2c;
  image.writeUInt16LE(16, 5);
  image.writeUInt16LE(8, 7);
  image[9] = transparent ? 0xc0 : 0; // Local palette + interlaced rows in GIF89a.
  const rows = transparent ? [0, 4, 2, 6, 1, 3, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  const codes = [];
  for (const y of rows) for (let x = 0; x < 16; x++) codes.push(4, (x + y) % 2);
  codes.push(5);
  const compressed = Buffer.alloc(Math.ceil((codes.length * 3) / 8));
  codes.forEach((code, i) => {
    for (let bit = 0; bit < 3; bit++) {
      const position = i * 3 + bit;
      compressed[position >>> 3] |= ((code >>> bit) & 1) << (position % 8);
    }
  });
  const blocks = [];
  for (let offset = 0; offset < compressed.length; offset += 17) {
    const block = compressed.subarray(offset, offset + 17);
    blocks.push(Buffer.from([block.length]), block);
  }
  const comment = Buffer.from('Original MediaAuth fixture', 'ascii');
  const bytes = Buffer.concat([
    header,
    ...(transparent
      ? [
          Buffer.from([0x21, 0xf9, 4, 1, 0, 0, 1, 0]),
          Buffer.from([0x21, 0xfe, comment.length]),
          comment,
          Buffer.from([0]),
        ]
      : [palette]),
    image,
    ...(transparent ? [palette] : []),
    Buffer.from([2]),
    ...blocks,
    Buffer.from([0, 0x3b]),
  ]);
  const name = transparent ? 'transparent-interlaced.gif' : 'single87.gif';
  await writeFile(new URL(`../tests/fixtures/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
