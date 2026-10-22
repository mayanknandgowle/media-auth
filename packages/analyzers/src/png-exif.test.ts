import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  DEFAULT_LIMITS,
  type AnalysisContext,
  type Media,
  type MediaHandle,
} from '@media-auth/core';
import { createMemoryHandle, imageProbe } from '@media-auth/media';
import { createFoundationRegistry, pngExifAdapter } from './index.js';
import { nodeSha256Hasher } from './node.js';

const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };
const fixture = (name = 'exif-little.png') =>
  readFileSync(new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url));
function media(bytes: Uint8Array, handle: MediaHandle = createMemoryHandle(bytes)): Media {
  return {
    descriptor: {
      kind: 'IMAGE',
      mimeType: 'image/png',
      source: { acquisition: 'LOCAL_FILE' },
      sizeBytes: bytes.length,
      metadataAvailability: 'NOT_PROBED',
      capabilities: ['RANGE_READ'],
      limitations: [],
    },
    handle,
  };
}
const inspect = (bytes: Uint8Array, custom = context) => pngExifAdapter.read(media(bytes), custom);
function chunk(type: string, data: Uint8Array) {
  const bytes = Buffer.alloc(data.length + 12);
  bytes.writeUInt32BE(data.length);
  bytes.write(type, 4, 'ascii');
  bytes.set(data, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, bytes.length - 4)), bytes.length - 4);
  return bytes;
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = (...chunks: Uint8Array[]) => Buffer.concat([signature, ...chunks]);
function parts(bytes = fixture()) {
  return {
    header: bytes.subarray(8, 33),
    exif: bytes.subarray(33, 315),
    tiff: bytes.subarray(41, 311),
    image: bytes.subarray(315, -12),
    end: bytes.subarray(-12),
  };
}

describe('bounded recorded PNG EXIF', () => {
  it.each(['little', 'big'])(
    'reads %s-endian fields through real probes and conservative analysis',
    async (order) => {
      const bytes = fixture(`exif-${order}.png`);
      expect(await inspect(bytes)).toMatchObject({
        status: 'DETECTED',
        observations: expect.arrayContaining([
          { kind: 'RECORDED', format: 'EXIF', field: 'cameraMake', value: 'MediaAuth' },
          { kind: 'RECORDED', format: 'EXIF', field: 'software', value: 'MediaAuth <fixture>' },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'orientation',
            value: order === 'little' ? 6 : 1,
          },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'dateTimeOriginal',
            value: '2026:10:22 12:34:56',
          },
        ]),
      });
      const handle = createMemoryHandle(bytes);
      const descriptor = await imageProbe.probe(handle, { acquisition: 'LOCAL_FILE' });
      const report = await analyze(
        { descriptor, handle },
        createFoundationRegistry(nodeSha256Hasher),
      );
      expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
      expect(report.media.metadataAvailability).toBe('NOT_PROBED');
      expect(report.conclusion).toMatchObject({
        verdict: 'INCONCLUSIVE',
        origin: 'UNKNOWN',
        confidence: { kind: 'NOT_ASSESSED' },
      });
      expect(report.evidence.find((e) => e.source.id === 'media-auth.png-exif')).toMatchObject({
        status: 'DETECTED',
        confidence: { kind: 'NOT_ASSESSED' },
      });
    },
  );

  it('keeps absence scoped and access failures unavailable', async () => {
    const bytes = readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url));
    expect(await inspect(bytes)).toMatchObject({
      status: 'NOT_DETECTED',
      scope: expect.stringContaining('CRC-checked static PNG'),
    });
    expect(
      await pngExifAdapter.read({ descriptor: media(bytes).descriptor }, context),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await pngExifAdapter.read(
        { ...media(bytes), descriptor: { ...media(bytes).descriptor, mimeType: 'image/webp' } },
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await pngExifAdapter.read(
        media(bytes, {
          sizeBytes: bytes.length,
          async read() {
            throw new Error('I/O');
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await pngExifAdapter.read(
        media(bytes, {
          sizeBytes: -1,
          async read() {
            throw new Error('Must not read');
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'INCONCLUSIVE');
  });

  it('parses only the bytes whose CRC was checked, with no metadata reread', async () => {
    const bytes = fixture();
    let payloadReads = 0;
    const result = await pngExifAdapter.read(
      media(bytes, {
        sizeBytes: bytes.length,
        async read(offset, length) {
          if (offset === 41) payloadReads++;
          if (offset === 311) bytes[181] = 88; // Change live Make bytes after the retained data read.
          return bytes.subarray(offset, offset + length);
        },
      }),
      context,
    );
    expect(payloadReads).toBe(1);
    expect(result).toMatchObject({
      status: 'DETECTED',
      observations: expect.arrayContaining([
        { kind: 'RECORDED', format: 'EXIF', field: 'cameraMake', value: 'MediaAuth' },
      ]),
    });
  });

  it('rejects every prefix, trailing bytes and checksum damage in any chunk', async () => {
    const bytes = fixture();
    for (let n = 0; n < bytes.length; n++)
      expect(await inspect(bytes.subarray(0, n))).toHaveProperty('status', 'INCONCLUSIVE');
    expect(await inspect(Buffer.concat([bytes, Buffer.from([0])]))).toHaveProperty(
      'status',
      'INCONCLUSIVE',
    );
    for (let offset = 8; offset < bytes.length;) {
      const changed = Buffer.from(bytes);
      const length = bytes.readUInt32BE(offset);
      const end = offset + length + 12;
      changed[end - 1] = (changed[end - 1] ?? 0) ^ 1;
      const result = await inspect(changed);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
      offset = end;
    }
    const p = parts();
    const unknown = chunk('tEXt', Buffer.from('Recorded\0ignored'));
    const valid = png(p.header, p.exif, p.image, unknown, p.end);
    expect(await inspect(valid)).toHaveProperty('status', 'DETECTED');
    unknown[unknown.length - 1] = (unknown[unknown.length - 1] ?? 0) ^ 1;
    expect(await inspect(png(p.header, p.exif, p.image, unknown, p.end))).toHaveProperty(
      'status',
      'INCONCLUSIVE',
    );
  });

  it.each([
    [
      'signature',
      (b: Buffer) => {
        b[0] = 0;
      },
    ],
    [
      'reserved type case',
      (b: Buffer) => {
        b.write('eXif', 37);
      },
    ],
    [
      'type bytes',
      (b: Buffer) => {
        b.write('e1If', 37);
      },
    ],
    [
      'huge declared length',
      (b: Buffer) => {
        b.writeUInt32BE(0xffffffff, 33);
      },
    ],
    [
      'out-of-bounds payload',
      (b: Buffer) => {
        b.writeUInt32BE(400, 33);
      },
    ],
  ] as const)('rejects malformed %s without observations', async (_name, mutate) => {
    const bytes = fixture();
    mutate(bytes);
    const result = await inspect(bytes);
    expect(result).toHaveProperty('status', 'INCONCLUSIVE');
    expect(result).not.toHaveProperty('observations');
  });

  it('rejects misplaced/duplicate/excluded chunks with independently correct CRCs', async () => {
    const p = parts();
    const values = [
      png(p.exif, p.header, p.image, p.end),
      png(p.header, p.header, p.exif, p.image, p.end),
      png(chunk('IHDR', new Uint8Array(12)), p.exif, p.image, p.end),
      png(p.header, p.image, p.exif, p.end),
      png(p.header, p.exif, p.exif, p.image, p.end),
      png(p.header, p.exif, p.end),
      png(p.header, p.exif, p.image),
      png(p.header, p.exif, chunk('IDAT', new Uint8Array()), p.end),
      png(p.header, p.exif, p.image, chunk('tEXt', new Uint8Array()), p.image, p.end),
      png(p.header, p.exif, p.image, chunk('IEND', Buffer.from([0]))),
      png(p.header, p.exif, chunk('ABCD', new Uint8Array()), p.image, p.end),
      png(p.header, p.exif, chunk('acTL', new Uint8Array(8)), p.image, p.end),
      png(p.header, p.exif, chunk('fcTL', new Uint8Array(26)), p.image, p.end),
      png(p.header, p.exif, chunk('fdAT', new Uint8Array(4)), p.image, p.end),
      png(p.header, p.exif, p.image, chunk('PLTE', new Uint8Array(3)), p.end),
      png(p.header, chunk('PLTE', new Uint8Array(2)), p.exif, p.image, p.end),
    ];
    for (const value of values) {
      const r = await inspect(value);
      expect(r).toHaveProperty('status', 'INCONCLUSIVE');
      expect(r).not.toHaveProperty('observations');
    }
  });

  it('rejects unsupported TIFF headers, prefixes and ambiguous recorded fields after valid carrier CRCs', async () => {
    const p = parts();
    for (const mutate of [
      (b: Buffer) => b.write('ZZ'),
      (b: Buffer) => b.writeUInt16LE(43, 2),
      (b: Buffer) => b.writeUInt32LE(0xffffffff, 4),
      (b: Buffer) => b.writeUInt32LE(8, 78),
      (b: Buffer) => b.writeUInt16LE(0x010f, 22),
    ]) {
      const tiff = Buffer.from(p.tiff);
      mutate(tiff);
      expect(await inspect(png(p.header, chunk('eXIf', tiff), p.image, p.end))).toHaveProperty(
        'status',
        'INCONCLUSIVE',
      );
    }
    for (const data of [Buffer.concat([Buffer.from('Exif\0\0'), p.tiff]), new Uint8Array()])
      expect(await inspect(png(p.header, chunk('eXIf', data), p.image, p.end))).toHaveProperty(
        'status',
        'INCONCLUSIVE',
      );
  });

  it('bounds allocation, work and ranges independently of media probing', async () => {
    const bytes = fixture();
    const p = parts();
    expect(
      await inspect(bytes, {
        ...context,
        limits: { ...DEFAULT_LIMITS, maxChunkBytes: 270, maxChunks: 17 },
      }),
    ).toHaveProperty('status', 'DETECTED');
    for (const limits of [
      { maxBytes: bytes.length - 1 },
      { maxChunkBytes: 269 },
      { maxChunks: 16 },
      { maxChunks: 0 },
    ])
      await expect(
        inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, ...limits } }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const exact = png(
      p.header,
      chunk('eXIf', Buffer.concat([p.tiff, Buffer.alloc(65536 - p.tiff.length)])),
      p.image,
      p.end,
    );
    let violation = false;
    let maxRead = 0;
    expect(
      await pngExifAdapter.read(
        media(exact, {
          sizeBytes: exact.length,
          async read(offset, length) {
            violation ||= offset < 0 || offset + length > exact.length || length > 4096;
            maxRead = Math.max(maxRead, length);
            return exact.subarray(offset, offset + length);
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'DETECTED');
    expect(violation).toBe(false);
    expect(maxRead).toBe(4096);
    const over = png(p.header, chunk('eXIf', new Uint8Array(65537)), p.image, p.end);
    maxRead = 0;
    await expect(
      pngExifAdapter.read(
        media(over, {
          sizeBytes: over.length,
          async read(offset, length) {
            maxRead = Math.max(maxRead, length);
            return over.subarray(offset, offset + length);
          },
        }),
        context,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(maxRead).toBeLessThanOrEqual(13);
    const count = Buffer.from(p.tiff);
    count.writeUInt16LE(129, 8);
    await expect(
      inspect(png(p.header, chunk('eXIf', count), p.image, p.end)),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const flood = png(
      p.header,
      ...Array.from({ length: 20 }, () => chunk('tEXt', new Uint8Array())),
      p.exif,
      p.image,
      p.end,
    );
    await expect(
      inspect(flood, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 10 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    // Large opaque payload is CRC-scanned in bounded blocks, never inflated/retained.
    const opaque = png(p.header, chunk('tEXt', new Uint8Array(12000)), p.exif, p.image, p.end);
    expect(await inspect(opaque)).toHaveProperty('status', 'DETECTED');
    expect(
      await inspect(opaque, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 21 } }),
    ).toHaveProperty('status', 'DETECTED');
    await expect(
      inspect(opaque, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 20 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('rejects inexact ranges and propagates cancellation before/after reads', async () => {
    const bytes = fixture();
    for (const delta of [-1, 1])
      expect(
        await pngExifAdapter.read(
          media(bytes, {
            sizeBytes: bytes.length,
            async read(_offset, length) {
              return new Uint8Array(length + delta);
            },
          }),
          context,
        ),
      ).toHaveProperty('status', 'INCONCLUSIVE');
    await expect(inspect(bytes, { ...context, cancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    let cancelled = false;
    await expect(
      pngExifAdapter.read(
        media(bytes, {
          sizeBytes: bytes.length,
          async read(offset, length) {
            cancelled = true;
            return bytes.subarray(offset, offset + length);
          },
        }),
        { ...context, cancelled: () => cancelled },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('never hides unexpected parser errors in deterministic memory mutations', async () => {
    const original = fixture();
    for (let i = 0; i < original.length; i++) {
      const bytes = Buffer.from(original);
      bytes[i] = (bytes[i] ?? 0) ^ 255;
      try {
        expect(['DETECTED', 'NOT_DETECTED', 'INCONCLUSIVE']).toContain(
          (await inspect(bytes)).status,
        );
      } catch (error) {
        expect(error).toMatchObject({ code: 'RESOURCE_LIMIT' });
      }
    }
  });
});
