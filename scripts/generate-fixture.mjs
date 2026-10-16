import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(1, 0);
header.writeUInt32BE(1, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('tEXt', Buffer.from('Software\0MediaAuth deterministic fixture', 'ascii')),
  chunk('IDAT', deflateSync(Buffer.from([0, 40, 130, 200, 255]), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/known.png', png);
console.log(
  `known.png: ${png.length} bytes, SHA-256 ${createHash('sha256').update(png).digest('hex')}`,
);

// Original T.81 fixtures: two grayscale 8x8 blocks, constant sample value 128.
// Minimal DC category-zero / AC EOB Huffman tables, with one-bit codes.
function segment(marker, payload) {
  const length = payload.length + 2;
  return Buffer.from([0xff, marker, length >> 8, length & 255, ...payload]);
}
for (const progressive of [false, true]) {
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, [74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    segment(0xdb, [0, ...Array(64).fill(1)]),
    segment(progressive ? 0xc2 : 0xc0, [8, 0, 8, 0, 16, 1, 1, 0x11, 0]),
    segment(0xc4, [0, 1, ...Array(15).fill(0), 0, 0x10, 1, ...Array(15).fill(0), 0]),
    segment(0xda, [1, 1, 0, 0, progressive ? 0 : 63, 0]),
    Buffer.from([progressive ? 0x3f : 0x0f]),
    ...(progressive ? [segment(0xda, [1, 1, 0, 1, 63, 0]), Buffer.from([0x3f])] : []),
    Buffer.from([0xff, 0xd9]),
  ]);
  const name = progressive ? 'progressive.jpg' : 'baseline.jpg';
  await writeFile(`tests/fixtures/${name}`, jpeg);
  console.log(
    `${name}: ${jpeg.length} bytes, SHA-256 ${createHash('sha256').update(jpeg).digest('hex')}`,
  );
}
