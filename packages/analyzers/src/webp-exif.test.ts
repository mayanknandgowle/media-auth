import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  DEFAULT_LIMITS,
  type AnalysisContext,
  type Media,
  type MediaHandle,
} from '@media-auth/core';
import { createMemoryHandle, imageProbe } from '@media-auth/media';
import { createFoundationRegistry, webpExifAdapter } from './index.js';
import { nodeSha256Hasher } from './node.js';

const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };
const fixture = (name = 'exif-little.webp') =>
  readFileSync(new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url));
function media(bytes: Uint8Array, handle: MediaHandle = createMemoryHandle(bytes)): Media {
  return {
    descriptor: {
      kind: 'IMAGE',
      mimeType: 'image/webp',
      source: { acquisition: 'LOCAL_FILE' },
      sizeBytes: bytes.length,
      metadataAvailability: 'NOT_PROBED',
      capabilities: ['RANGE_READ'],
      limitations: [],
    },
    handle,
  };
}
const inspect = (bytes: Uint8Array, custom = context) => webpExifAdapter.read(media(bytes), custom);
function chunk(type: string, payload: Uint8Array) {
  const out = Buffer.alloc(8 + payload.length + (payload.length % 2));
  out.write(type);
  out.writeUInt32LE(payload.length, 4);
  out.set(payload, 8);
  return out;
}
function riff(...chunks: Uint8Array[]) {
  const bytes = Buffer.concat([Buffer.from('RIFF0000WEBP'), ...chunks]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return bytes;
}
function parts(bytes = fixture()) {
  return {
    extended: bytes.subarray(12, 30),
    image: bytes.subarray(30, 56),
    exif: bytes.subarray(56),
    tiff: bytes.subarray(64),
  };
}

describe('bounded recorded WebP EXIF', () => {
  it.each(['little', 'big'])(
    'reads %s-endian recorded fields through the real pipeline',
    async (order) => {
      const bytes = fixture(`exif-${order}.webp`);
      expect(await inspect(bytes)).toMatchObject({
        status: 'DETECTED',
        observations: expect.arrayContaining([
          { kind: 'RECORDED', format: 'EXIF', field: 'cameraModel', value: 'Fixture Camera' },
          { kind: 'RECORDED', format: 'EXIF', field: 'software', value: 'MediaAuth <fixture>' },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'dateTimeDigitized',
            value: '2026:10:22 12:35:00',
          },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'orientation',
            value: order === 'little' ? 6 : 1,
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
      expect(report.evidence.find((e) => e.source.id === 'media-auth.webp-exif')).toMatchObject({
        status: 'DETECTED',
        confidence: { kind: 'NOT_ASSESSED' },
      });
      expect(report.evidence.find((e) => e.source.id === 'media-auth.jpeg-exif')).toHaveProperty(
        'status',
        'UNAVAILABLE',
      );
    },
  );

  it('distinguishes scoped absence and unavailable access without inferring authenticity', async () => {
    const plain = readFileSync(new URL('../../../tests/fixtures/lossless.webp', import.meta.url));
    expect(await inspect(plain)).toMatchObject({
      status: 'NOT_DETECTED',
      scope: expect.stringContaining('exact static WebP RIFF extent'),
    });
    const bytes = fixture();
    expect(
      await webpExifAdapter.read({ descriptor: media(bytes).descriptor }, context),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await webpExifAdapter.read(
        { ...media(bytes), descriptor: { ...media(bytes).descriptor, mimeType: 'image/jpeg' } },
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await webpExifAdapter.read(
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
      await webpExifAdapter.read(
        media(bytes, {
          sizeBytes: NaN,
          async read() {
            throw new Error('Must not read');
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'INCONCLUSIVE');
  });

  it('supports one compatibility prefix with a disclosure and rejects malformed/repeated prefixes', async () => {
    const p = parts();
    const prefixed = riff(
      p.extended,
      p.image,
      chunk('EXIF', Buffer.concat([Buffer.from('Exif\0\0'), p.tiff])),
    );
    expect(await inspect(prefixed)).toMatchObject({
      status: 'DETECTED',
      limitations: expect.arrayContaining([expect.stringContaining('nonstandard')]),
    });
    for (const prefix of ['Exif\0X', 'Exif\0\0Exif\0\0'])
      expect(
        await inspect(
          riff(p.extended, p.image, chunk('EXIF', Buffer.concat([Buffer.from(prefix), p.tiff]))),
        ),
      ).toHaveProperty('status', 'INCONCLUSIVE');
  });

  it.each([
    [
      'bad RIFF',
      (b: Buffer) => {
        b[0] = 0;
      },
    ],
    [
      'bad WEBP',
      (b: Buffer) => {
        b[8] = 0;
      },
    ],
    [
      'wrong extent',
      (b: Buffer) => {
        b.writeUInt32LE(12, 4);
      },
    ],
    [
      'odd extent',
      (b: Buffer) => {
        b.writeUInt32LE(b.length - 9, 4);
      },
    ],
    [
      'first chunk',
      (b: Buffer) => {
        b.write('JUNK', 12);
      },
    ],
    [
      'missing EXIF flag',
      (b: Buffer) => {
        b[20] = 0;
      },
    ],
    [
      'flag without EXIF',
      (b: Buffer) => {
        b.write('JUNK', 56);
      },
    ],
    [
      'animation flag',
      (b: Buffer) => {
        b[20] = 10;
      },
    ],
    [
      'animation chunk',
      (b: Buffer) => {
        b.write('ANMF', 30);
      },
    ],
    [
      'missing image',
      (b: Buffer) => {
        b.write('JUNK', 30);
      },
    ],
    [
      'bad TIFF',
      (b: Buffer) => {
        b.writeUInt16LE(43, 66);
      },
    ],
    [
      'oversized TIFF offset',
      (b: Buffer) => {
        b.writeUInt32LE(0xffffffff, 68);
      },
    ],
  ] as const)('reports %s inconclusively without partial fields', async (_name, mutate) => {
    const bytes = fixture();
    mutate(bytes);
    const result = await inspect(bytes);
    expect(result).toHaveProperty('status', 'INCONCLUSIVE');
    expect(result).not.toHaveProperty('observations');
  });

  it('rejects every truncated prefix, trailing bytes, duplicate chunks and nonzero padding', async () => {
    const bytes = fixture();
    for (let n = 0; n < bytes.length; n++)
      expect(await inspect(bytes.subarray(0, n))).toHaveProperty('status', 'INCONCLUSIVE');
    expect(await inspect(Buffer.concat([bytes, Buffer.from([0, 0])]))).toHaveProperty(
      'status',
      'INCONCLUSIVE',
    );
    const p = parts();
    for (const value of [
      riff(p.extended, p.image, p.exif, p.exif),
      riff(p.extended, p.image, p.image, p.exif),
      riff(p.extended, p.image, p.extended, p.exif),
      riff(p.image, p.exif),
      riff(chunk('VP8X', new Uint8Array(9)), p.image, p.exif),
      riff(p.extended, chunk('VP8L', new Uint8Array()), p.exif),
      riff(p.extended, p.image, chunk('EXIF', new Uint8Array())),
    ])
      expect(await inspect(value)).toHaveProperty('status', 'INCONCLUSIVE');
    const padded = riff(p.extended, p.image, chunk('JUNK', Buffer.from([1])), p.exif);
    expect(await inspect(padded)).toHaveProperty('status', 'DETECTED');
    padded[65] = 1;
    expect(await inspect(padded)).toHaveProperty('status', 'INCONCLUSIVE');
    // Valid metadata can appear before or after image data in extended WebP.
    expect(await inspect(riff(p.extended, p.exif, p.image))).toHaveProperty('status', 'DETECTED');
  });

  it('bounds input, chunks, TIFF work, payload allocation and read requests independently', async () => {
    const bytes = fixture();
    expect(
      await inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, maxChunkBytes: 270 } }),
    ).toHaveProperty('status', 'DETECTED');
    expect(
      await inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 13 } }),
    ).toHaveProperty('status', 'DETECTED');
    await expect(
      inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 12 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const limits of [
      { maxBytes: bytes.length - 1 },
      { maxChunks: 2 },
      { maxChunkBytes: 269 },
      { maxChunks: 0 },
    ])
      await expect(
        inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, ...limits } }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const p = parts();
    // The exact allocation ceiling is accepted; the first byte over it is rejected below.
    const exact = riff(
      p.extended,
      p.image,
      chunk('EXIF', Buffer.concat([p.tiff, Buffer.alloc(65536 - p.tiff.length)])),
    );
    expect(await inspect(exact)).toHaveProperty('status', 'DETECTED');
    const large = riff(
      p.extended,
      p.image,
      chunk('EXIF', Buffer.concat([p.tiff, Buffer.alloc(12000)])),
    );
    let violation = false;
    let maxRead = 0;
    const handle: MediaHandle = {
      sizeBytes: large.length,
      async read(offset, length) {
        violation ||= offset < 0 || offset + length > large.length || length > 4096;
        maxRead = Math.max(maxRead, length);
        return large.subarray(offset, offset + length);
      },
    };
    expect(await webpExifAdapter.read(media(large, handle), context)).toHaveProperty(
      'status',
      'DETECTED',
    );
    expect(violation).toBe(false);
    expect(maxRead).toBe(4096);
    const over = riff(p.extended, p.image, chunk('EXIF', new Uint8Array(65537)));
    maxRead = 0;
    await expect(
      webpExifAdapter.read(
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
    expect(maxRead).toBeLessThanOrEqual(12);
    const badCount = fixture();
    badCount.writeUInt16LE(129, 72);
    await expect(inspect(badCount)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const flood = riff(
      p.extended,
      p.image,
      ...Array.from({ length: 20 }, () => chunk('JUNK', new Uint8Array())),
      p.exif,
    );
    await expect(
      inspect(flood, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 10 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('rejects inexact ranges and propagates cancellation before and after I/O', async () => {
    const bytes = fixture();
    for (const delta of [-1, 1])
      expect(
        await webpExifAdapter.read(
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
      webpExifAdapter.read(
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

  it('keeps deterministic byte mutations within explicit results and typed resource failures', async () => {
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
