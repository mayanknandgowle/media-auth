import { readFile, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Extend original synthetic TIFF with a replacement ExifIFD. Old bytes remain
// unreferenced padding; image payloads and the original six fixtures are unchanged.
function dimensions(jpeg, little, different) {
  const old = jpeg.subarray(12, 4 + jpeg.readUInt16BE(4));
  const oldView = new DataView(old.buffer, old.byteOffset, old.byteLength);
  const primary = oldView.getUint32(4, little);
  const count = oldView.getUint16(primary, little);
  let pointer;
  for (let i = 0; i < count; i++) {
    const entry = primary + 2 + i * 12;
    if (oldView.getUint16(entry, little) === 0x8769) pointer = entry + 8;
  }
  assert.ok(pointer);
  const sub = oldView.getUint32(pointer, little);
  assert.equal(oldView.getUint16(sub, little), 4);
  const entries = Array.from({ length: 4 }, (_, i) =>
    Buffer.from(old.subarray(sub + 2 + i * 12, sub + 14 + i * 12)),
  );
  for (const [tag, value] of [
    [0xa002, different ? 32 : 16],
    [0xa003, different ? 16 : 8],
  ]) {
    const entry = Buffer.alloc(12);
    const view = new DataView(entry.buffer, entry.byteOffset, entry.byteLength);
    view.setUint16(0, tag, little);
    view.setUint16(2, different ? 4 : 3, little);
    view.setUint32(4, 1, little);
    if (different) view.setUint32(8, value, little);
    else view.setUint16(8, value, little);
    entries.push(entry);
  }
  const tagOf = (entry) =>
    new DataView(entry.buffer, entry.byteOffset, entry.byteLength).getUint16(0, little);
  entries.sort((a, b) => tagOf(a) - tagOf(b));
  const out = Buffer.alloc(old.length + 2 + entries.length * 12 + 4);
  out.set(old);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  view.setUint32(pointer, old.length, little);
  view.setUint16(old.length, entries.length, little);
  entries.forEach((entry, i) => out.set(entry, old.length + 2 + i * 12));
  return out;
}
function pngChunk(type, payload) {
  const out = Buffer.alloc(payload.length + 12);
  out.writeUInt32BE(payload.length);
  out.write(type, 4, 'ascii');
  out.set(payload, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}
for (const different of [false, true]) {
  const order = different ? 'big' : 'little';
  const base = new URL(`../tests/fixtures/metadata/exif-${order}.jpg`, import.meta.url);
  const jpeg = await readFile(base);
  const tiff = dimensions(jpeg, !different, different);
  for (const format of ['jpg', 'webp', 'png']) {
    const original = await readFile(
      new URL(`../tests/fixtures/metadata/exif-${order}.${format}`, import.meta.url),
    );
    let result;
    if (format === 'jpg') {
      const prefix = Buffer.from([255, 225, 0, 0, 69, 120, 105, 102, 0, 0]);
      prefix.writeUInt16BE(tiff.length + 8, 2);
      result = Buffer.concat([
        original.subarray(0, 2),
        prefix,
        tiff,
        original.subarray(4 + original.readUInt16BE(4)),
      ]);
    } else if (format === 'png') {
      assert.equal(original.toString('ascii', 37, 41), 'eXIf');
      const end = 33 + 12 + original.readUInt32BE(33);
      result = Buffer.concat([
        original.subarray(0, 33),
        pngChunk('eXIf', tiff),
        original.subarray(end),
      ]);
    } else {
      let offset = 12;
      while (
        offset < original.length &&
        original.toString('ascii', offset, offset + 4) !== 'EXIF'
      ) {
        const length = original.readUInt32LE(offset + 4);
        offset += 8 + length + (length % 2);
      }
      assert.ok(offset < original.length);
      const oldLength = original.readUInt32LE(offset + 4);
      const chunk = Buffer.alloc(8 + tiff.length + (tiff.length % 2));
      chunk.write('EXIF');
      chunk.writeUInt32LE(tiff.length, 4);
      chunk.set(tiff, 8);
      result = Buffer.concat([
        original.subarray(0, offset),
        chunk,
        original.subarray(offset + 8 + oldLength + (oldLength % 2)),
      ]);
      result.writeUInt32LE(result.length - 8, 4);
    }
    const name = `dimensions-${different ? 'different' : 'match'}.${format}`;
    await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), result);
    console.log(
      `${name}: ${result.length} bytes; SHA-256 ${createHash('sha256').update(result).digest('hex')}`,
    );
  }
}
