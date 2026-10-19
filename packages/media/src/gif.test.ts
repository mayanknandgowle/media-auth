import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type MediaHandle } from '@media-auth/core';
import { createMemoryHandle, gifProbe, imageProbe } from './index.js';

const source = { acquisition: 'LOCAL_FILE', label: 'misleading.webp' } as const;
const names = ['single87.gif', 'transparent-interlaced.gif'];
const fixture = (name = names[0]) =>
  readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
const probe = (bytes: Uint8Array, limits = DEFAULT_LIMITS) =>
  gifProbe.probe(createMemoryHandle(bytes), source, limits);
const palette = Buffer.from([128, 128, 128, 0, 96, 255]);
const raster = fixture().subarray(19, -1);
function header(packed = 0x80): Buffer {
  const bytes = Buffer.from(fixture().subarray(0, 13));
  bytes.write('GIF89a');
  bytes[10] = packed;
  return bytes;
}
const file = (...blocks: Uint8Array[]) =>
  Buffer.concat([header(), palette, ...blocks, Buffer.from([0x3b])]);
const gce = (flags = 1, index = 1) => Buffer.from([0x21, 0xf9, 4, flags, 0, 0, index, 0]);
const comment = (...payloads: Uint8Array[]) =>
  Buffer.concat([
    Buffer.from([0x21, 0xfe]),
    ...payloads.flatMap((payload) => [Buffer.from([payload.length]), payload]),
    Buffer.from([0]),
  ]);
const application = Buffer.concat([
  Buffer.from([0x21, 0xff, 11]),
  Buffer.from('MEDAUTH1000'),
  Buffer.from([1, 42, 0]),
]);

describe('bounded single-image GIF probe', () => {
  it.each(names)(
    'recognizes original %s by bytes and discloses inspection limits',
    async (name) => {
      const bytes = fixture(name);
      const descriptor = await imageProbe.probe(createMemoryHandle(bytes), source);
      expect(descriptor).toMatchObject({
        kind: 'IMAGE',
        mimeType: 'image/gif',
        dimensions: { width: 16, height: 8 },
        source,
        sizeBytes: bytes.length,
        metadataAvailability: 'NOT_PROBED',
        capabilities: ['RANGE_READ', 'STREAM'],
      });
      expect(descriptor.limitations.join(' ')).toContain(
        'decodability and authenticity are not established',
      );
      expect(descriptor.limitations.join(' ')).toContain('Dimensions describe the logical screen');
      expect(descriptor).not.toHaveProperty('contentHash');
      expect(descriptor).not.toHaveProperty('durationSeconds');
      expect(await probe(bytes)).toEqual(descriptor);
    },
  );

  it('reports the canvas rather than a smaller offset image, with either active palette', async () => {
    const image = Buffer.from(raster);
    image.writeUInt16LE(2, 1);
    image.writeUInt16LE(1, 3);
    image.writeUInt16LE(12, 5);
    image.writeUInt16LE(6, 7);
    image[9] = 0xc0;
    const local = Buffer.concat([image.subarray(0, 10), palette, image.subarray(10)]);
    for (const bytes of [file(local), Buffer.concat([header(0), local, Buffer.from([0x3b])])])
      expect(await probe(bytes)).toMatchObject({ dimensions: { width: 16, height: 8 } });
    // This structural mutation is not asserted decodable: pixels were not regenerated.
  });

  it('skips comments/application data without losing pending graphic-control scope', async () => {
    const bytes = file(
      gce(),
      comment(Buffer.from([0x3b, 0x2c, 0x21])),
      application,
      raster,
      comment(),
      application,
    );
    expect(await probe(bytes)).toMatchObject({ metadataAvailability: 'NOT_PROBED' });
    const withAspect = Buffer.from(bytes);
    withAspect[12] = 255;
    expect((await probe(withAspect)).limitations.join(' ')).toContain(
      'pixel aspect ratio is not applied',
    );
    // Non-transparent index is ignored; transparency uses the local table when present.
    expect(await probe(file(gce(0, 255), raster))).toHaveProperty('mimeType', 'image/gif');
    const local = Buffer.from(raster.subarray(0, 10));
    local[9] = 0x81;
    expect(
      await probe(file(gce(1, 3), Buffer.concat([local, Buffer.alloc(12), raster.subarray(10)]))),
    ).toHaveProperty('mimeType', 'image/gif');
  });

  it('rejects every truncated prefix and trailing/concatenated fixtures', async () => {
    for (const name of names) {
      const bytes = fixture(name);
      for (let length = 0; length < bytes.length; length++)
        await expect(probe(bytes.subarray(0, length))).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
      for (const suffix of [Buffer.from([0]), bytes])
        await expect(probe(Buffer.concat([bytes, suffix]))).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
    }
  });

  it.each([
    ['no image', file()],
    ['duplicate control', file(gce(), gce(), raster)],
    ['orphan control', file(raster, gce())],
    ['invalid control size', file(Buffer.from([0x21, 0xf9, 3, 0, 0, 0, 0]), raster)],
    ['invalid control terminator', file(Buffer.from([0x21, 0xf9, 4, 0, 0, 0, 0, 1]), raster)],
    ['reserved control flags', file(gce(0x80), raster)],
    ['bad transparent index', file(gce(1, 2), raster)],
    ['invalid application size', file(Buffer.from([0x21, 0xff, 10]), raster)],
    ['unknown block', file(Buffer.from([0]), raster)],
    ['truncated sub-block', file(raster, Buffer.from([0x21, 0xfe, 255, 42]))],
    ['empty image data', file(Buffer.concat([raster.subarray(0, 11), Buffer.from([0])]))],
  ])('rejects malformed structure: %s', async (_name, bytes) => {
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it.each([
    ['multiple images', file(raster, gce(), raster)],
    ['plain text', file(Buffer.from([0x21, 1]), raster)],
    ['unknown extension', file(Buffer.from([0x21, 0xee]), raster)],
    ['user input', file(gce(2), raster)],
    ['undefined disposal', file(gce(16), raster)],
    ['missing in-file palette', Buffer.concat([header(0), raster, Buffer.from([0x3b])])],
  ])('rejects unsupported scope: %s', async (_name, bytes) => {
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  });

  it('checks versions, reserved fields, dimensions, palettes, and minimum LZW sizes', async () => {
    for (const [offset, value] of [
      [6, 0],
      [8, 0],
      [10, 0x88],
      [11, 2],
      [12, 1], // Screen fields in GIF87a.
      [20, 1],
      [22, 1],
      [24, 0],
      [26, 0],
      [28, 0x18],
      [28, 0x20],
      [29, 0],
      [29, 1],
      [29, 9],
      [29, 255],
    ]) {
      if (offset === undefined || value === undefined) throw new Error('Missing mutation.');
      const bytes = fixture();
      bytes[offset] = value;
      await expect(probe(bytes)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    const extended87 = file(comment(), raster);
    extended87.write('GIF87a');
    await expect(probe(extended87)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    const unknown = fixture();
    unknown.write('GIF90a');
    await expect(imageProbe.probe(createMemoryHandle(unknown), source)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    });
    await expect(probe(unknown)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    await expect(probe(Buffer.concat([header(0x87), palette]))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('accepts supported control methods but makes no transparency or timing claim', async () => {
    for (const disposal of [0, 1, 2, 3]) {
      const control = gce(disposal << 2);
      control.writeUInt16LE(65535, 4);
      const descriptor = await probe(file(control, raster));
      expect(descriptor.limitations.join(' ')).toContain(
        'Transparency, timing, looping, and disposal rendering are not verified',
      );
      expect(descriptor).not.toHaveProperty('durationSeconds');
    }
    const image = Buffer.from(raster);
    image.fill(255, 12, 29); // Change compressed payload only, preserving sub-block lengths.
    expect((await probe(file(image))).limitations.join(' ')).toContain(
      'LZW pixels, palette contents, and metadata payloads were not decoded',
    );
  });

  it('enforces byte/pixel limits before reading and exact count/aggregate payload boundaries', async () => {
    // Prefix, palette, image, six image sub-blocks, terminator, trailer = eleven.
    const bytes = fixture();
    const limits = {
      ...DEFAULT_LIMITS,
      maxBytes: bytes.length,
      maxPixels: 128,
      maxChunkBytes: 97,
      maxChunks: 11,
    };
    expect(await probe(bytes, limits)).toHaveProperty('mimeType', 'image/gif');
    for (const reduced of [
      { maxBytes: bytes.length - 1 },
      { maxPixels: 127 },
      { maxChunkBytes: 96 },
      { maxChunks: 10 },
    ])
      await expect(probe(bytes, { ...limits, ...reduced })).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT',
      });
    for (const metadata of [
      comment(Buffer.alloc(60), Buffer.alloc(40)),
      Buffer.concat([
        application.subarray(0, 14),
        Buffer.from([60]),
        Buffer.alloc(60),
        Buffer.from([40]),
        Buffer.alloc(40),
        Buffer.from([0]),
      ]),
    ]) {
      expect(
        await probe(file(metadata, raster), { ...DEFAULT_LIMITS, maxChunkBytes: 100 }),
      ).toHaveProperty('mimeType', 'image/gif');
      await expect(
        probe(file(metadata, raster), { ...DEFAULT_LIMITS, maxChunkBytes: 99 }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    }
    // Empty comments still consume an extension and terminator each.
    await expect(
      probe(file(comment(), comment(), raster), { ...limits, maxBytes: 1000, maxChunks: 14 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(
      await probe(file(comment(), comment(), raster), { ...limits, maxBytes: 1000, maxChunks: 15 }),
    ).toHaveProperty('mimeType', 'image/gif');
  });

  it('budgets skipped palettes and extension headers/control payloads', async () => {
    for (const [extension, maxChunkBytes] of [
      [gce(), 3],
      [application, 10],
    ] as const) {
      // No global palette: the intended extension budget is encountered first.
      const bytes = Buffer.concat([header(0), extension, raster, Buffer.from([0x3b])]);
      await expect(probe(bytes, { ...DEFAULT_LIMITS, maxChunkBytes })).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT',
      });
    }
    await expect(
      probe(file(raster), { ...DEFAULT_LIMITS, maxChunkBytes: 5 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const [extension, maxChunks] of [
      [gce(), 14],
      [application, 15],
    ] as const) {
      expect(await probe(file(extension, raster), { ...DEFAULT_LIMITS, maxChunks })).toHaveProperty(
        'mimeType',
        'image/gif',
      );
      await expect(
        probe(file(extension, raster), { ...DEFAULT_LIMITS, maxChunks: maxChunks - 1 }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    }
    const localHeader = Buffer.from(raster.subarray(0, 10));
    localHeader[9] = 0x87;
    await expect(
      probe(file(Buffer.concat([localHeader, Buffer.alloc(768), raster.subarray(10)])), {
        ...DEFAULT_LIMITS,
        maxChunkBytes: 767,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('skips large comment contents and stops extension floods at the count budget', async () => {
    const payloads = Array.from({ length: 100 }, () => Buffer.alloc(255, 0x2c));
    const metadata = comment(...payloads);
    const bytes = file(metadata, raster);
    let readBytes = 0;
    expect(
      await gifProbe.probe(
        {
          sizeBytes: bytes.length,
          async read(offset, length) {
            readBytes += length;
            for (let i = 0; i < payloads.length; i++) {
              const start = 22 + i * 256;
              expect(offset < start + 255 && offset + length > start).toBe(false);
            }
            return bytes.subarray(offset, offset + length);
          },
        },
        source,
      ),
    ).toHaveProperty('mimeType', 'image/gif');
    expect(readBytes).toBeLessThan(150);
    const flood = file(...Array.from({ length: 100 }, () => comment()), raster);
    let reads = 0;
    await expect(
      gifProbe.probe(
        {
          sizeBytes: flood.length,
          async read(offset, length) {
            reads++;
            expect(offset + length).toBeLessThan(64);
            return flood.subarray(offset, offset + length);
          },
        },
        source,
        { ...DEFAULT_LIMITS, maxChunks: 20 },
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(reads).toBeLessThan(32);
  });

  it('never reads skipped palettes or payloads, uses bounded reads, and propagates I/O failures', async () => {
    const bytes = fixture();
    const skipped = [
      [13, 19],
      [31, 48],
      [49, 66],
      [67, 84],
      [85, 102],
      [103, 120],
      [121, 133],
    ];
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        expect(length).toBeLessThanOrEqual(13);
        expect(
          skipped.some(([start = 0, end = 0]) => offset < end && offset + length > start),
        ).toBe(false);
        return bytes.subarray(offset, offset + length);
      },
    };
    expect((await gifProbe.probe(handle, source)).capabilities).toEqual(['RANGE_READ']);
    await expect(
      imageProbe.probe(
        {
          sizeBytes: bytes.length,
          async read(offset, length) {
            expect(length).toBeLessThanOrEqual(2);
            return bytes.subarray(offset, offset + length);
          },
        },
        source,
        { ...DEFAULT_LIMITS, maxChunkBytes: 2 },
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const failure = new Error('Adapter failed');
    await expect(
      gifProbe.probe(
        {
          sizeBytes: bytes.length,
          async read() {
            throw failure;
          },
        },
        source,
      ),
    ).rejects.toBe(failure);
  });

  it('validates size/limits before I/O and requires exact byte-range access', async () => {
    const unreadable: MediaHandle = {
      sizeBytes: 135,
      async read() {
        throw new Error('Must not read');
      },
    };
    for (const key of ['maxBytes', 'maxPixels', 'maxChunkBytes', 'maxChunks'])
      for (const value of [0, -1, NaN, Infinity, 1.5])
        await expect(
          gifProbe.probe(unreadable, source, { ...DEFAULT_LIMITS, [key]: value }),
        ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const sizeBytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      await expect(gifProbe.probe({ ...unreadable, sizeBytes }, source)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    await expect(
      gifProbe.probe(unreadable, source, { ...DEFAULT_LIMITS, maxBytes: 134 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    let streamed = false;
    await expect(
      gifProbe.probe(
        {
          sizeBytes: 135,
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
        gifProbe.probe(
          {
            sizeBytes: 135,
            async read(_offset, length) {
              return new Uint8Array(length + delta);
            },
          },
          source,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
