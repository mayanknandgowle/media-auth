import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type MediaHandle } from '@media-auth/core';
import { createMemoryHandle, imageProbe, webpProbe } from './index.js';

const source = { acquisition: 'LOCAL_FILE', label: 'misleading.jpg' } as const;
const fixture = (name = 'lossy.webp') =>
  readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
const probe = (bytes: Uint8Array, limits = DEFAULT_LIMITS) =>
  webpProbe.probe(createMemoryHandle(bytes), source, limits);
function chunk(type: string, payload: Uint8Array = new Uint8Array()): Buffer {
  const bytes = Buffer.alloc(8 + payload.length + (payload.length % 2));
  bytes.write(type, 0, 'ascii');
  bytes.writeUInt32LE(payload.length, 4);
  bytes.set(payload, 8);
  return bytes;
}
function riff(...chunks: Uint8Array[]): Buffer {
  const bytes = Buffer.concat([Buffer.from('RIFF0000WEBP'), ...chunks]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return bytes;
}
function extended(flags = 0, width = 16, height = 8): Buffer {
  const bytes = Buffer.alloc(10);
  bytes[0] = flags;
  bytes.writeUIntLE(width - 1, 4, 3);
  bytes.writeUIntLE(height - 1, 7, 3);
  return chunk('VP8X', bytes);
}
const lossy = fixture().subarray(12);
const lossless = fixture('lossless.webp').subarray(12);
const alpha = chunk('ALPH', new Uint8Array([0, ...new Uint8Array(128).fill(128)]));
const metadata = chunk('EXIF', Buffer.from('not interpreted: VP8X ANIM'));

describe('bounded static WebP probe', () => {
  it.each(['lossy.webp', 'lossless.webp', 'alpha.webp'])(
    'probes original %s by bytes with truthful limitations',
    async (name) => {
      const bytes = fixture(name);
      const descriptor = await imageProbe.probe(createMemoryHandle(bytes), source);
      expect(descriptor).toMatchObject({
        kind: 'IMAGE',
        mimeType: 'image/webp',
        sizeBytes: bytes.length,
        dimensions: { width: 16, height: 8 },
        source,
        metadataAvailability: 'NOT_PROBED',
        capabilities: ['RANGE_READ', 'STREAM'],
      });
      expect(descriptor.limitations.join(' ')).toContain(
        'decodability and authenticity are not established',
      );
      expect(descriptor).not.toHaveProperty('contentHash');
      expect(await probe(bytes)).toEqual(descriptor);
    },
  );

  it('accepts static extended variants, metadata in either order, and unknown chunks', async () => {
    for (const bytes of [
      riff(extended(), lossy),
      riff(extended(), lossless),
      riff(extended(16), alpha, lossy),
      riff(extended(8), metadata, lossy),
      riff(extended(8), lossy, metadata),
      riff(extended(32 | 4), chunk('ICCP'), chunk('XMP '), lossy),
      riff(extended(16), alpha, chunk('zzzz', new Uint8Array([1])), lossy),
      riff(lossy, chunk('zzzz', new Uint8Array([255]))),
    ])
      expect(await probe(bytes)).toMatchObject({ dimensions: { width: 16, height: 8 } });
  });

  it('ignores reserved VP8X fields and does not treat the VP8L alpha hint as verified', async () => {
    const header = extended(0xc1);
    header.fill(255, 9, 12);
    const withFutureFields = chunk(
      'VP8X',
      Buffer.concat([header.subarray(8), Buffer.from([42, 43])]),
    );
    const hinted = Buffer.from(lossless);
    hinted[12] = (hinted[12] ?? 0) | 16;
    for (const bytes of [
      riff(withFutureFields, lossless),
      riff(extended(), hinted),
      riff(extended(16), lossless),
    ])
      expect(await probe(bytes)).toMatchObject({
        mimeType: 'image/webp',
        metadataAvailability: 'NOT_PROBED',
      });
  });

  it('rejects every truncated fixture prefix and trailing/concatenated inputs', async () => {
    for (const name of ['lossy.webp', 'lossless.webp', 'alpha.webp']) {
      const bytes = fixture(name);
      for (let length = 0; length < bytes.length; length++)
        await expect(probe(bytes.subarray(0, length))).rejects.toThrow();
      for (const suffix of [Buffer.from([0]), bytes])
        await expect(probe(Buffer.concat([bytes, suffix]))).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
    }
  });

  it.each([
    ['missing image', riff(extended())],
    ['empty container', riff()],
    ['unknown first chunk', riff(chunk('zzzz'), lossy)],
    ['duplicate image', riff(lossy, lossless)],
    ['duplicate extended header', riff(extended(), extended(), lossy)],
    ['late extended header', riff(lossy, extended())],
    ['short extended header', riff(chunk('VP8X', new Uint8Array(9)), lossy)],
    ['mismatched canvas', riff(extended(0, 15), lossy)],
    ['missing alpha chunk', riff(extended(16), lossy)],
    ['undeclared alpha', riff(extended(), alpha, lossy)],
    ['alpha without extended header', riff(lossy, alpha)],
    ['late alpha', riff(extended(), lossy, alpha)],
    ['duplicate alpha', riff(extended(16), alpha, alpha, lossy)],
    ['lossless with separate alpha', riff(extended(16), alpha, lossless)],
    ['short alpha', riff(extended(16), chunk('ALPH', Buffer.from([0])), lossy)],
    ['incorrect raw alpha extent', riff(extended(16), chunk('ALPH', Buffer.from([0, 1])), lossy)],
    ['metadata without extended header', riff(lossy, metadata)],
    ['duplicate metadata', riff(extended(8), metadata, metadata, lossy)],
    ['undeclared metadata', riff(extended(), metadata, lossy)],
    ['declared missing metadata', riff(extended(8), lossy)],
    ['late color profile', riff(extended(32), lossy, chunk('ICCP'))],
    ['color profile after alpha', riff(extended(48), alpha, chunk('ICCP'), lossy)],
    ['header-only lossless', riff(chunk('VP8L', lossless.subarray(8, 13)))],
    ['header-only lossy', riff(chunk('VP8 ', lossy.subarray(8, 18)))],
    ['truncated chunk header', riff(lossy, Buffer.alloc(2))],
  ])('rejects invalid structure: %s', async (_name, bytes) => {
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it.each([
    ['animation flag', riff(extended(2), lossy)],
    ['animation control', riff(extended(), chunk('ANIM'), lossy)],
    ['animation frame', riff(extended(), chunk('ANMF'), lossy)],
    ['alpha compression', riff(extended(16), chunk('ALPH', Buffer.from([2, 1])), lossy)],
    ['alpha preprocessing', riff(extended(16), chunk('ALPH', Buffer.from([32, 1])), lossy)],
  ])('rejects unsupported scope: %s', async (_name, bytes) => {
    await expect(probe(bytes)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  });

  it('validates RIFF/chunk lengths and odd-byte padding', async () => {
    const base = riff(lossy, chunk('zzzz', Buffer.from([1])));
    for (const [offset, value] of [
      [4, 0xffffffff],
      [4, 4],
      [16, base.length],
      [16, 0xffffffff],
    ] as const) {
      const bytes = Buffer.from(base);
      bytes.writeUInt32LE(value, offset);
      await expect(probe(bytes)).rejects.toThrow();
    }
    base[base.length - 1] = 1;
    await expect(probe(base)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    // Declared odd payload extends to EOF; its required pad is outside the RIFF extent.
    const unpadded = riff(lossy, Buffer.from('zzzz0000'));
    unpadded.writeUInt32LE(1, unpadded.length - 4);
    await expect(probe(unpadded)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('discloses that a matching header does not validate the compressed stream', async () => {
    const bytes = fixture('lossless.webp');
    bytes.fill(255, 25, 37);
    const descriptor = await probe(bytes);
    expect(descriptor.limitations.join(' ')).toContain(
      'Compressed pixels, alpha data, and metadata payloads were not decoded',
    );
    expect(descriptor.metadataAvailability).toBe('NOT_PROBED');
  });

  it.each([
    ['keyframe bit', 20, 1, 'INVALID_INPUT'],
    ['hidden frame', 20, 0, 'INVALID_INPUT'],
    ['reserved VP8 version', 20, 24, 'UNSUPPORTED_MEDIA'],
    ['start code', 23, 0, 'INVALID_INPUT'],
    ['zero width', 26, 0, 'INVALID_INPUT'],
    ['scaled frame', 27, 64, 'UNSUPPORTED_MEDIA'],
  ])('checks lossy header: %s', async (_name, offset, value, code) => {
    const bytes = fixture();
    bytes[offset] = value;
    await expect(probe(bytes)).rejects.toMatchObject({ code });
  });

  it('checks first-partition extent, lossless signature/version, and pixel budgets', async () => {
    for (const tag of [16, 16 + (1000 << 5)]) {
      const bytes = fixture();
      bytes.writeUIntLE(tag, 20, 3);
      await expect(probe(bytes)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
    for (const [offset, value, code] of [
      [20, 0, 'INVALID_INPUT'],
      [24, 32, 'UNSUPPORTED_MEDIA'],
    ] as const) {
      const bytes = fixture('lossless.webp');
      bytes[offset] = value;
      await expect(probe(bytes)).rejects.toMatchObject({ code });
    }
    await expect(
      probe(riff(extended(0, 0x1000000, 0x1000000), lossy), {
        ...DEFAULT_LIMITS,
        maxPixels: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    for (const name of ['lossy.webp', 'lossless.webp', 'alpha.webp'])
      await expect(
        probe(fixture(name), { ...DEFAULT_LIMITS, maxPixels: 127 }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('bounds bytes, chunk payloads, and counts including skipped zero-length chunks', async () => {
    const bytes = riff(lossy, chunk('zzzz'), chunk('zzzz'));
    await expect(
      probe(bytes, { ...DEFAULT_LIMITS, maxBytes: bytes.length - 1 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(
      probe(bytes, { ...DEFAULT_LIMITS, maxChunkBytes: lossy.length - 9 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(probe(bytes, { ...DEFAULT_LIMITS, maxChunks: 2 })).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
    });
    expect(
      await probe(bytes, {
        ...DEFAULT_LIMITS,
        maxBytes: bytes.length,
        maxChunkBytes: lossy.length - 8,
        maxChunks: 3,
        maxPixels: 128,
      }),
    ).toMatchObject({ mimeType: 'image/webp' });
  });

  it('never reads or allocates a skipped payload and bounds every range request', async () => {
    const bytes = riff(extended(8), chunk('EXIF', new Uint8Array(100_000)), lossy);
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        expect(length).toBeLessThanOrEqual(12);
        expect(offset < 38 || offset >= 100_038).toBe(true);
        return bytes.subarray(offset, offset + length);
      },
    };
    expect((await webpProbe.probe(handle, source)).capabilities).toEqual(['RANGE_READ']);
    await expect(
      imageProbe.probe(
        {
          sizeBytes: fixture().length,
          async read(offset, length) {
            expect(length).toBeLessThanOrEqual(2);
            return fixture().subarray(offset, offset + length);
          },
        },
        source,
        { ...DEFAULT_LIMITS, maxChunkBytes: 2 },
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('validates limits and size before reading; rejects missing/inexact range access', async () => {
    const unreadable: MediaHandle = {
      sizeBytes: 44,
      async read() {
        throw new Error('Must not read');
      },
    };
    for (const maxChunks of [0, -1, NaN, Infinity, 1.5])
      await expect(
        webpProbe.probe(unreadable, source, { ...DEFAULT_LIMITS, maxChunks }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const sizeBytes of [-1, NaN, Number.MAX_SAFE_INTEGER + 1])
      await expect(webpProbe.probe({ ...unreadable, sizeBytes }, source)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    let streamed = false;
    await expect(
      webpProbe.probe(
        {
          sizeBytes: 44,
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
        webpProbe.probe(
          {
            sizeBytes: 44,
            async read(_offset, length) {
              return new Uint8Array(length + delta);
            },
          },
          source,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(probe(Buffer.from('RIFF0000WAVE'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    });
  });
});
