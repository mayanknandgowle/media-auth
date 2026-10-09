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
