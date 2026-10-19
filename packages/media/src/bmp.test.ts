import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type MediaHandle } from '@media-auth/core';
import { bmpProbe, imageProbe, createMemoryHandle } from './index.js';

const names = ['rgb24-bottom-up.bmp', 'rgb24-top-down.bmp'];
const source = { acquisition: 'LOCAL_FILE', label: 'misleading.jpg' } as const;
const fixture = (name = names[0]) =>
  readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
const probe = (bytes: Uint8Array, limits = DEFAULT_LIMITS) =>
  bmpProbe.probe(createMemoryHandle(bytes), source, limits);
function gap(length: number): Buffer {
  const original = fixture();
  const bytes = Buffer.concat([
    original.subarray(0, 54),
    Buffer.alloc(length, 0xff),
    original.subarray(54),
  ]);
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54 + length, 10);
  return bytes;
}

describe('bounded 24-bit BI_RGB BMP', () => {
  it.each(names)('reports positive encoded dimensions for %s by signature', async (name) => {
    const bytes = fixture(name);
    const descriptor = await imageProbe.probe(createMemoryHandle(bytes), source);
    expect(descriptor).toMatchObject({
      kind: 'IMAGE',
      mimeType: 'image/bmp',
      dimensions: { width: 3, height: 2 },
      sizeBytes: bytes.length,
      source,
      metadataAvailability: 'NOT_PROBED',
      capabilities: ['RANGE_READ', 'STREAM'],
    });
    expect(descriptor.limitations.join(' ')).toContain('authenticity are not established');
    expect(descriptor).not.toHaveProperty('contentHash');
    expect(await probe(bytes)).toEqual(descriptor);
  });

  it('rejects all truncated fixture prefixes and trailing data, including rewritten size', async () => {
    for (const name of names) {
      const bytes = fixture(name);
      for (let length = 0; length < bytes.length; length++)
        await expect(probe(bytes.subarray(0, length))).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
      for (const suffix of [Buffer.from([0]), bytes]) {
        const longer = Buffer.concat([bytes, suffix]);
        await expect(probe(longer)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        longer.writeUInt32LE(longer.length, 2);
        await expect(probe(longer)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      }
      const missingRowByte = Buffer.from(bytes.subarray(0, -1));
      missingRowByte.writeUInt32LE(missingRowByte.length, 2);
      await expect(probe(missingRowByte)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it.each([
    ['file size', 2, 0, 'INVALID_INPUT'],
    ['reserved field', 6, 1, 'INVALID_INPUT'],
    ['second reserved field', 8, 1, 'INVALID_INPUT'],
    ['offset overlaps header', 10, 53, 'INVALID_INPUT'],
    ['offset outside input', 10, 0xffffffff, 'INVALID_INPUT'],
    ['OS/2 header', 14, 12, 'UNSUPPORTED_MEDIA'],
    ['V4 header', 14, 108, 'UNSUPPORTED_MEDIA'],
    ['V5 header', 14, 124, 'UNSUPPORTED_MEDIA'],
    ['huge header', 14, 0xffffffff, 'UNSUPPORTED_MEDIA'],
    ['zero width', 18, 0, 'INVALID_INPUT'],
    ['negative width', 18, 0xffffffff, 'INVALID_INPUT'],
    ['zero height', 22, 0, 'INVALID_INPUT'],
    ['RLE8 compression', 30, 1, 'UNSUPPORTED_MEDIA'],
    ['RLE4 compression', 30, 2, 'UNSUPPORTED_MEDIA'],
    ['bitfields', 30, 3, 'UNSUPPORTED_MEDIA'],
    ['embedded JPEG', 30, 4, 'UNSUPPORTED_MEDIA'],
    ['embedded PNG', 30, 5, 'UNSUPPORTED_MEDIA'],
    ['image size mismatch', 34, 23, 'INVALID_INPUT'],
    ['color table', 46, 1, 'UNSUPPORTED_MEDIA'],
    ['important colors', 50, 1, 'UNSUPPORTED_MEDIA'],
  ] as const)('rejects %s', async (_label, offset, value, code) => {
    const bytes = fixture();
    bytes.writeUInt32LE(value, offset);
    await expect(probe(bytes)).rejects.toMatchObject({ code });
  });

  it('checks plane count and explicitly excludes other depths', async () => {
    const bytes = fixture();
    bytes.writeUInt16LE(2, 26);
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    for (const depth of [0, 1, 4, 8, 16, 32, 65535]) {
      const variant = fixture();
      variant.writeUInt16LE(depth, 28);
      await expect(probe(variant)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    }
    bytes.write('ZZ');
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  });

  it('bounds signed dimensions without bitwise stride or multiplication overflow', async () => {
    for (const [width, height] of [
      [1, -2147483648],
      [2147483647, 4_000_000],
      [1431655766, 1],
    ]) {
      if (width === undefined || height === undefined) throw new Error('Missing dimensions');
      const bytes = fixture();
      bytes.writeInt32LE(width, 18);
      bytes.writeInt32LE(height, 22);
      await expect(probe(bytes)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
      await expect(
        probe(bytes, { ...DEFAULT_LIMITS, maxPixels: Number.MAX_SAFE_INTEGER }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('enforces exact byte/pixel/payload/block limits and optional gap budgets', async () => {
    const bytes = fixture();
    const limits = {
      ...DEFAULT_LIMITS,
      maxBytes: 78,
      maxPixels: 6,
      maxChunkBytes: 24,
      maxChunks: 3,
    };
    expect(await probe(bytes, limits)).toHaveProperty('mimeType', 'image/bmp');
    for (const reduced of [
      { maxBytes: 77 },
      { maxPixels: 5 },
      { maxChunkBytes: 23 },
      { maxChunks: 2 },
    ])
      await expect(probe(bytes, { ...limits, ...reduced })).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT',
      });
    expect(await probe(gap(24), { ...limits, maxBytes: 102, maxChunks: 4 })).toHaveProperty(
      'mimeType',
      'image/bmp',
    );
    await expect(probe(gap(24), { ...limits, maxBytes: 102 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
    });
    await expect(probe(gap(25), { ...limits, maxBytes: 103, maxChunks: 4 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
    });
  });

  it('never reads pixels or gaps, splits headers, and leaves resolution fields uninterpreted', async () => {
    const bytes = gap(100_000);
    bytes.writeInt32LE(-1, 38);
    bytes.writeInt32LE(2147483647, 42);
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        expect(offset + length).toBeLessThanOrEqual(54);
        expect(length).toBeLessThanOrEqual(40);
        return bytes.subarray(offset, offset + length);
      },
    };
    expect((await bmpProbe.probe(handle, source)).capabilities).toEqual(['RANGE_READ']);
    for (const budget of [2, 24]) {
      const small = fixture();
      const result = bmpProbe.probe(
        {
          sizeBytes: small.length,
          async read(offset, length) {
            expect(length).toBeLessThanOrEqual(budget);
            return small.subarray(offset, offset + length);
          },
        },
        source,
        { ...DEFAULT_LIMITS, maxChunkBytes: budget },
      );
      if (budget === 2) await expect(result).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
      else expect(await result).toHaveProperty('mimeType', 'image/bmp');
    }
  });

  it('validates limits/size before access and rejects missing/inexact range adapters', async () => {
    const unreadable: MediaHandle = {
      sizeBytes: 78,
      async read() {
        throw new Error('Must not read');
      },
    };
    for (const key of ['maxBytes', 'maxPixels', 'maxChunkBytes', 'maxChunks'])
      for (const value of [0, -1, NaN, Infinity, 1.5])
        await expect(
          bmpProbe.probe(unreadable, source, { ...DEFAULT_LIMITS, [key]: value }),
        ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const sizeBytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(bmpProbe.probe({ ...unreadable, sizeBytes }, source)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    let streamed = false;
    await expect(
      bmpProbe.probe(
        {
          sizeBytes: 78,
          async *stream() {
            streamed = true;
            yield fixture();
          },
        },
        source,
      ),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    expect(streamed).toBe(false);
    for (const delta of [-1, 1])
      await expect(
        bmpProbe.probe(
          {
            sizeBytes: 78,
            async read(_offset, length) {
              return new Uint8Array(length + delta);
            },
          },
          source,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
