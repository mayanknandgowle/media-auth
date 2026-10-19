import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Original 3x2 RGB gradient, with three ignored padding bytes on each 12-byte row.
for (const topDown of [false, true]) {
  const bytes = Buffer.alloc(78);
  bytes.write('BM');
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(3, 18);
  bytes.writeInt32LE(topDown ? -2 : 2, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  bytes.writeUInt32LE(topDown ? 0 : 24, 34);
  for (let row = 0; row < 2; row++) {
    const y = topDown ? row : 1 - row;
    for (let x = 0; x < 3; x++) {
      const offset = 54 + row * 12 + x * 3;
      bytes.set([200 - 40 * x, 30 + 90 * y, 40 + 60 * x], offset);
    }
    bytes.fill(0xa5, 54 + row * 12 + 9, 54 + (row + 1) * 12);
  }
  const name = topDown ? 'rgb24-top-down.bmp' : 'rgb24-bottom-up.bmp';
  await writeFile(new URL(`../tests/fixtures/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
