import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type MediaHandle } from '@media-auth/core';
import { createMemoryHandle, imageProbe, jpegProbe } from './index.js';

const source = { acquisition: 'LOCAL_FILE', label: 'misleading.png' } as const;
const fixture = (name = 'baseline.jpg') =>
  new Uint8Array(readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url)));
const segment = (code: number, data: number[]) => [
  255,
  code,
  (data.length + 2) >> 8,
  (data.length + 2) & 255,
  ...data,
];
const frame = segment(0xc0, [8, 0, 8, 0, 16, 1, 1, 0x11, 0]);
const scan = segment(0xda, [1, 1, 0, 0, 63, 0]);
const minimal = (...parts: number[][]) => new Uint8Array([255, 216, ...parts.flat(), 255, 217]);
const probe = (bytes: Uint8Array, limits = DEFAULT_LIMITS) =>
  jpegProbe.probe(createMemoryHandle(bytes), source, limits);

describe('bounded JPEG and image probes', () => {
  it('honors small read budgets during signature dispatch', async () => {
    const bytes = fixture();
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        expect(length).toBeLessThanOrEqual(2);
        return bytes.slice(offset, offset + length);
      },
    };
    await expect(
      imageProbe.probe(handle, source, { ...DEFAULT_LIMITS, maxChunkBytes: 2 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('supports interleaved and separate baseline component scans', async () => {
    const color = segment(0xc0, [8, 0, 8, 0, 16, 3, 1, 34, 0, 2, 17, 0, 3, 17, 0]);
    for (const scans of [
      [segment(0xda, [3, 1, 0, 2, 0, 3, 0, 0, 63, 0]), [15]],
      [
        scan,
        [15],
        segment(0xda, [1, 2, 0, 0, 63, 0]),
        [15],
        segment(0xda, [1, 3, 0, 0, 63, 0]),
        [15],
      ],
    ])
      await expect(probe(minimal(color, ...scans))).resolves.toMatchObject({
        dimensions: { width: 16, height: 8 },
      });
    await expect(probe(minimal(color, scan, [15]))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const duplicate = segment(0xc0, [8, 0, 8, 0, 16, 2, 1, 17, 0, 1, 17, 0]);
    await expect(probe(minimal(duplicate, scan, [15]))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects invalid progressive spectral selection and approximation', async () => {
    const progressive = segment(0xc2, [8, 0, 8, 0, 16, 1, 1, 17, 0]);
    for (const parameters of [
      [0, 63, 0],
      [63, 1, 0],
      [1, 64, 0],
      [0, 0, 0x20],
      [0, 0, 14],
    ]) {
      await expect(
        probe(minimal(progressive, segment(0xda, [1, 1, 0, ...parameters]), [15])),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('counts ending markers and validates size before any read', async () => {
    const bytes = minimal(frame, scan, [15]);
    await expect(probe(bytes, { ...DEFAULT_LIMITS, maxChunks: 4 })).resolves.toMatchObject({
      mimeType: 'image/jpeg',
    });
    await expect(probe(bytes, { ...DEFAULT_LIMITS, maxChunks: 3 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
    });
    for (const sizeBytes of [-1, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        jpegProbe.probe(
          {
            sizeBytes,
            async read() {
              throw new Error('Must not read');
            },
          },
          source,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it.each(['baseline.jpg', 'progressive.jpg'])(
    'reports encoded dimensions and honest limits for %s',
    async (name) => {
      const descriptor = await imageProbe.probe(createMemoryHandle(fixture(name)), source);
      expect(descriptor).toMatchObject({
        kind: 'IMAGE',
        mimeType: 'image/jpeg',
        dimensions: { width: 16, height: 8 },
        metadataAvailability: 'NOT_PROBED',
        source,
      });
      expect(descriptor.limitations.join(' ')).toContain('decodability are not established');
      expect(await probe(fixture(name))).toEqual(descriptor);
    },
  );

  it('routes PNG by signature and rejects unrelated or empty data', async () => {
    expect(await imageProbe.probe(createMemoryHandle(fixture('known.png')), source)).toMatchObject({
      mimeType: 'image/png',
    });
    for (const bytes of [new Uint8Array(), new Uint8Array([255]), new Uint8Array([1, 2, 3])])
      await expect(imageProbe.probe(createMemoryHandle(bytes), source)).rejects.toMatchObject({
        code: 'UNSUPPORTED_MEDIA',
      });
  });

  it('rejects every truncated prefix of both fixtures', async () => {
    for (const name of ['baseline.jpg', 'progressive.jpg']) {
      const bytes = fixture(name);
      for (let length = 0; length < bytes.length; length++)
        await expect(probe(bytes.slice(0, length))).rejects.toThrow();
    }
  });

  it.each([
    ['no frame', minimal(scan, [15])],
    ['no scan', minimal(frame)],
    ['empty entropy', minimal(frame, scan)],
    ['duplicate frame', minimal(frame, frame, scan, [15])],
    ['duplicate SOI', minimal([255, 216], frame, scan, [15])],
    ['missing marker prefix', minimal([1], frame, scan, [15])],
    ['short segment length', minimal([255, 224, 0, 1], frame, scan, [15])],
    ['long segment length', minimal([255, 224, 255, 255], frame, scan, [15])],
    ['unknown scan selector', minimal(frame, segment(0xda, [1, 2, 0, 0, 63, 0]), [15])],
    ['invalid baseline spectrum', minimal(frame, segment(0xda, [1, 1, 0, 1, 63, 0]), [15])],
    ['zero width', minimal(segment(0xc0, [8, 0, 8, 0, 0, 1, 1, 17, 0]), scan, [15])],
    ['zero sampling', minimal(segment(0xc0, [8, 0, 8, 0, 16, 1, 1, 0, 0]), scan, [15])],
    ['restart outside scan', minimal(frame, [255, 208], scan, [15])],
    ['restart without interval', minimal(frame, scan, [15, 255, 208, 15])],
    ['wrong restart sequence', minimal(frame, segment(0xdd, [0, 1]), scan, [15, 255, 209, 15])],
    ['invalid stuffing', minimal(frame, scan, [15, 255, 255, 0, 15])],
    ['duplicate sequential scan', minimal(frame, scan, [15], scan, [15])],
  ])('rejects malformed framing: %s', async (_name, bytes) => {
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects trailing or concatenated images', async () => {
    for (const suffix of [new Uint8Array([0]), fixture()])
      await expect(probe(new Uint8Array([...fixture(), ...suffix]))).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
  });

  it.each([
    segment(0xc1, [8, 0, 8, 0, 16, 1, 1, 17, 0]),
    segment(0xc2, [12, 0, 8, 0, 16, 1, 1, 17, 0]),
    segment(0xc0, [8, 0, 0, 0, 16, 1, 1, 17, 0]),
    segment(0xdc, [0, 8]),
  ])('rejects unsupported processes without claiming a result', async (...header: number[]) => {
    await expect(probe(minimal(header, scan, [15]))).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    });
  });

  it('skips metadata marker lookalikes and accepts stuffing, fill, and ordered restarts', async () => {
    const bytes = minimal(
      segment(0xe1, [255, 217, 255, 218]),
      frame,
      segment(0xdd, [0, 1]),
      scan,
      [255, 0, 15, 255, 208, 15, 255, 209, 15, 255],
    );
    expect(await probe(bytes)).toMatchObject({ dimensions: { width: 16, height: 8 } });
  });

  it.each([
    { maxBytes: 154 },
    { maxPixels: 127 },
    { maxChunks: 2 },
    { maxChunkBytes: 8 },
    { maxChunks: 0 },
  ])('enforces policy budgets %j', async (limit) => {
    await expect(probe(fixture(), { ...DEFAULT_LIMITS, ...limit })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
    });
  });

  it('caps entropy intervals independently of total bytes and metadata segments', async () => {
    await expect(
      probe(minimal(frame, scan, Array(101).fill(1)), { ...DEFAULT_LIMITS, maxChunkBytes: 100 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(
      await probe(minimal(frame, scan, Array(100).fill(1)), {
        ...DEFAULT_LIMITS,
        maxChunkBytes: 100,
      }),
    ).toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('uses bounded forward reads across buffers and does not allocate a full entropy interval', async () => {
    const bytes = minimal(frame, scan, Array(140_000).fill(1));
    // A stuffed byte and a terminal marker each straddle a buffer boundary in separate cases.
    bytes[65535] = 255;
    bytes[65536] = 0;
    const sizes: number[] = [];
    let previousEnd = 0;
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        expect(offset).toBeGreaterThanOrEqual(previousEnd);
        previousEnd = offset + length;
        sizes.push(length);
        return bytes.slice(offset, offset + length);
      },
    };
    expect((await jpegProbe.probe(handle, source)).capabilities).toEqual(['RANGE_READ']);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(65536);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(bytes.length);
    await expect(probe(minimal(frame, scan, Array(65510).fill(1)))).resolves.toMatchObject({
      mimeType: 'image/jpeg',
    });
  });

  it('rejects inaccurate range adapters and stream-only access without reading a stream', async () => {
    for (const delta of [-1, 1]) {
      const handle: MediaHandle = {
        sizeBytes: 155,
        async read(_offset, length) {
          return new Uint8Array(length + delta);
        },
      };
      await expect(jpegProbe.probe(handle, source)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      await expect(imageProbe.probe(handle, source)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    }
    let consumed = false;
    const handle: MediaHandle = {
      sizeBytes: 155,
      async *stream() {
        consumed = true;
        yield fixture();
      },
    };
    await expect(jpegProbe.probe(handle, source)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    });
    await expect(imageProbe.probe(handle, source)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    });
    expect(consumed).toBe(false);
  });
});
