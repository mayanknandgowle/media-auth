import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Original synthetic metadata; original baseline JPEG pixels are unchanged.
const jpeg = await readFile(new URL('../tests/fixtures/baseline.jpg', import.meta.url));
await mkdir(new URL('../tests/fixtures/metadata/', import.meta.url), { recursive: true });
for (const little of [true, false]) {
  const primary = [
    [0x010f, 'MediaAuth'],
    [0x0110, 'Fixture Camera'],
    [0x0112, little ? 6 : 1],
    [0x0131, 'MediaAuth <fixture>'],
    [0x0132, '2026:10:22 12:34:56'],
    [0x8769, 'pointer'],
  ];
  const exif = [
    [0x9003, '2026:10:22 12:34:56'],
    [0x9004, '2026:10:22 12:35:00'],
    [0xa433, 'MediaAuth'],
    [0xa434, 'Fixture Lens'],
  ];
  const subOffset = 8 + 2 + primary.length * 12 + 4;
  let dataOffset = subOffset + 2 + exif.length * 12 + 4;
  const bytes = Buffer.alloc(1024);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.write(little ? 'II' : 'MM');
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  function directory(start, entries) {
    view.setUint16(start, entries.length, little);
    entries.forEach(([tag, value], index) => {
      const entry = start + 2 + index * 12;
      view.setUint16(entry, tag, little);
      if (value === 'pointer' || typeof value === 'number') {
        view.setUint16(entry + 2, value === 'pointer' ? 4 : 3, little);
        view.setUint32(entry + 4, 1, little);
        if (value === 'pointer') view.setUint32(entry + 8, subOffset, little);
        else view.setUint16(entry + 8, value, little);
      } else {
        const data = Buffer.from(`${value}\0`, 'ascii');
        view.setUint16(entry + 2, 2, little);
        view.setUint32(entry + 4, data.length, little);
        view.setUint32(entry + 8, dataOffset, little);
        bytes.set(data, dataOffset);
        dataOffset += data.length;
        if (dataOffset % 2) dataOffset++;
      }
    });
  }
  directory(8, primary);
  directory(subOffset, exif);
  const payload = Buffer.concat([Buffer.from('Exif\0\0'), bytes.subarray(0, dataOffset)]);
  const segment = Buffer.alloc(4);
  segment[0] = 255;
  segment[1] = 0xe1;
  segment.writeUInt16BE(payload.length + 2, 2);
  const result = Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
  const name = little ? 'exif-little.jpg' : 'exif-big.jpg';
  await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), result);
  console.log(
    `${name}: ${result.length} bytes; SHA-256 ${createHash('sha256').update(result).digest('hex')}`,
  );
}
