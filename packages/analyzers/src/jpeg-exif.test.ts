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
import { createFoundationRegistry, jpegExifAdapter } from './index.js';
import { nodeSha256Hasher } from './node.js';

const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };
const fixture = (name = 'exif-little.jpg') =>
  readFileSync(new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url));
function media(bytes: Uint8Array, handle: MediaHandle = createMemoryHandle(bytes)): Media {
  return {
    descriptor: {
      kind: 'IMAGE',
      mimeType: 'image/jpeg',
      source: { acquisition: 'LOCAL_FILE' },
      sizeBytes: bytes.length,
      metadataAvailability: 'NOT_PROBED',
      capabilities: ['RANGE_READ'],
      limitations: [],
    },
    handle,
  };
}
const inspect = (bytes: Uint8Array, custom = context) => jpegExifAdapter.read(media(bytes), custom);
function tag(bytes: Buffer, id: number, sub = false) {
  const start = sub ? 86 : 8;
  const count = bytes.readUInt16LE(12 + start);
  for (let i = 0; i < count; i++) {
    const offset = 12 + start + 2 + i * 12;
    if (bytes.readUInt16LE(offset) === id) return offset;
  }
  throw new Error('Missing fixture tag');
}

describe('bounded recorded JPEG EXIF', () => {
  it.each(['exif-little.jpg', 'exif-big.jpg'])(
    'reads selected recorded fields in %s with independent attribution',
    async (name) => {
      const bytes = fixture(name);
      const result = await inspect(bytes);
      expect(result).toMatchObject({
        status: 'DETECTED',
        observations: expect.arrayContaining([
          { kind: 'RECORDED', format: 'EXIF', field: 'blockPresent', value: true },
          { kind: 'RECORDED', format: 'EXIF', field: 'cameraMake', value: 'MediaAuth' },
          { kind: 'RECORDED', format: 'EXIF', field: 'cameraModel', value: 'Fixture Camera' },
          { kind: 'RECORDED', format: 'EXIF', field: 'software', value: 'MediaAuth <fixture>' },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'dateTimeOriginal',
            value: '2026:10:22 12:34:56',
          },
          { kind: 'RECORDED', format: 'EXIF', field: 'lensModel', value: 'Fixture Lens' },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'orientation',
            value: name.includes('little') ? 6 : 1,
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
      expect(report.evidence.find((e) => e.source.id === 'media-auth.jpeg-exif')).toMatchObject({
        status: 'DETECTED',
        confidence: { kind: 'NOT_ASSESSED' },
      });
    },
  );

  it('distinguishes scoped absence, malformed data, unsupported media and unavailable access', async () => {
    const plain = readFileSync(new URL('../../../tests/fixtures/baseline.jpg', import.meta.url));
    expect(await inspect(plain)).toMatchObject({
      status: 'NOT_DETECTED',
      scope: expect.stringContaining('before the first SOS'),
    });
    expect(await inspect(new Uint8Array([255, 216, 0]))).toHaveProperty('status', 'INCONCLUSIVE');
    expect(
      await jpegExifAdapter.read(
        { ...media(plain), descriptor: { ...media(plain).descriptor, mimeType: 'image/png' } },
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await jpegExifAdapter.read({ descriptor: media(plain).descriptor }, context),
    ).toHaveProperty('status', 'UNAVAILABLE');
    const unreadable = {
      sizeBytes: plain.length,
      async read() {
        throw new Error('Unavailable');
      },
    };
    expect(await jpegExifAdapter.read(media(plain, unreadable), context)).toHaveProperty(
      'status',
      'UNAVAILABLE',
    );
    // Later APP1 is outside the declared scope, even when present after the SOS introducer.
    const afterScan = Buffer.concat([Buffer.from([255, 216, 255, 218]), fixture().subarray(2)]);
    expect(await inspect(afterScan)).toHaveProperty('status', 'NOT_DETECTED');
  });

  it.each([
    [
      'byte order',
      (b: Buffer) => {
        b.write('ZZ', 12);
      },
    ],
    [
      'magic',
      (b: Buffer) => {
        b.writeUInt16LE(43, 14);
      },
    ],
    [
      'header overlap',
      (b: Buffer) => {
        b.writeUInt32LE(2, 16);
      },
    ],
    [
      'huge root offset',
      (b: Buffer) => {
        b.writeUInt32LE(0xffffffff, 16);
      },
    ],
    [
      'cycle',
      (b: Buffer) => {
        b.writeUInt32LE(8, tag(b, 0x8769) + 8);
      },
    ],
    [
      'overlap',
      (b: Buffer) => {
        b.writeUInt32LE(10, tag(b, 0x8769) + 8);
      },
    ],
    [
      'pointer type',
      (b: Buffer) => {
        b.writeUInt16LE(3, tag(b, 0x8769) + 2);
      },
    ],
    [
      'duplicate tags',
      (b: Buffer) => {
        b.writeUInt16LE(0x010f, tag(b, 0x0110));
      },
    ],
    [
      'known text type',
      (b: Buffer) => {
        b.writeUInt16LE(7, tag(b, 0x010f) + 2);
      },
    ],
    [
      'known text count',
      (b: Buffer) => {
        b.writeUInt32LE(0, tag(b, 0x010f) + 4);
      },
    ],
    [
      'text offset',
      (b: Buffer) => {
        b.writeUInt32LE(0xffffffff, tag(b, 0x010f) + 8);
      },
    ],
    [
      'text table overlap',
      (b: Buffer) => {
        b.writeUInt32LE(8, tag(b, 0x010f) + 8);
      },
    ],
    [
      'text terminator',
      (b: Buffer) => {
        const t = tag(b, 0x010f);
        b[12 + b.readUInt32LE(t + 8) + b.readUInt32LE(t + 4) - 1] = 65;
      },
    ],
    [
      'control text',
      (b: Buffer) => {
        b[12 + b.readUInt32LE(tag(b, 0x010f) + 8)] = 10;
      },
    ],
    [
      'non ASCII',
      (b: Buffer) => {
        b[12 + b.readUInt32LE(tag(b, 0x010f) + 8)] = 255;
      },
    ],
    [
      'orientation',
      (b: Buffer) => {
        b.writeUInt16LE(9, tag(b, 0x0112) + 8);
      },
    ],
    [
      'orientation type',
      (b: Buffer) => {
        b.writeUInt16LE(4, tag(b, 0x0112) + 2);
      },
    ],
    [
      'identifier',
      (b: Buffer) => {
        b[10] = 1;
      },
    ],
  ] as const)(
    'makes malformed %s inconclusive, retaining no partial observations',
    async (_name, mutate) => {
      const bytes = fixture();
      mutate(bytes);
      const result = await inspect(bytes);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
    },
  );

  it('rejects every prefix that truncates the EXIF APP1 block and duplicate EXIF blocks', async () => {
    const bytes = fixture();
    const end = 4 + bytes.readUInt16BE(4);
    for (let n = 0; n < end; n++)
      expect(await inspect(bytes.subarray(0, n))).toHaveProperty('status', 'INCONCLUSIVE');
    const duplicated = Buffer.concat([
      bytes.subarray(0, end),
      bytes.subarray(2, end),
      bytes.subarray(end),
    ]);
    expect(await inspect(duplicated)).toHaveProperty('status', 'INCONCLUSIVE');
  });

  it('enforces count/text/input/segment budgets and cancellation before I/O', async () => {
    const bytes = fixture();
    for (const mutate of [
      (b: Buffer) => b.writeUInt16LE(129, 20),
      (b: Buffer) => b.writeUInt32LE(0xffffffff, tag(b, 0x010f) + 4),
    ]) {
      const b = fixture();
      mutate(b);
      await expect(inspect(b)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    }
    for (const limits of [{ maxBytes: bytes.length - 1 }, { maxChunks: 1 }, { maxChunkBytes: 10 }])
      await expect(
        inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, ...limits } }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(inspect(bytes, { ...context, cancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    await expect(
      inspect(bytes, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 0 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('requires exact bounded ranges, stops fill floods, and skips unknown payloads', async () => {
    const bytes = fixture();
    let reads = 0;
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        reads++;
        expect(length).toBeLessThanOrEqual(4096);
        expect(offset + length).toBeLessThanOrEqual(bytes.length);
        return bytes.subarray(offset, offset + length);
      },
    };
    expect(await jpegExifAdapter.read(media(bytes, handle), context)).toHaveProperty(
      'status',
      'DETECTED',
    );
    expect(reads).toBeLessThan(64);
    for (const delta of [-1, 1])
      expect(
        await jpegExifAdapter.read(
          media(bytes, {
            sizeBytes: bytes.length,
            async read(_offset, length) {
              return new Uint8Array(length + delta);
            },
          }),
          context,
        ),
      ).toHaveProperty('status', 'INCONCLUSIVE');
    const flood = Buffer.concat([
      Buffer.from([255, 216]),
      Buffer.alloc(100, 255),
      Buffer.from([217]),
    ]);
    await expect(
      inspect(flood, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 10 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const unknown = fixture();
    const t = tag(unknown, 0x010f);
    unknown.writeUInt16LE(0x9999, t);
    unknown.writeUInt32LE(0xffffffff, t + 4);
    unknown.writeUInt32LE(0xffffffff, t + 8);
    expect(await inspect(unknown)).toHaveProperty('status', 'DETECTED');
  });

  it('supports inline and empty ASCII while enforcing the exact text boundary', async () => {
    const inline = fixture();
    const entry = tag(inline, 0x010f);
    inline.writeUInt32LE(4, entry + 4);
    inline.write('ABC\0', entry + 8, 'ascii');
    expect(await inspect(inline)).toMatchObject({
      status: 'DETECTED',
      observations: expect.arrayContaining([
        { kind: 'RECORDED', format: 'EXIF', field: 'cameraMake', value: 'ABC' },
      ]),
    });
    inline.writeUInt32LE(1, entry + 4);
    inline[entry + 8] = 0;
    const empty = await inspect(inline);
    if (empty.status !== 'DETECTED') throw new Error('Expected EXIF block');
    expect(empty.observations.some((item) => item.field === 'cameraMake')).toBe(false);
    // Append value bytes inside APP1, with a TIFF-relative pointer; preserve the original JPEG.
    const original = fixture();
    const end = 4 + original.readUInt16BE(4);
    const text = Buffer.concat([Buffer.alloc(256, 65), Buffer.from([0])]);
    const extended = Buffer.concat([original.subarray(0, end), text, original.subarray(end)]);
    extended.writeUInt16BE(original.readUInt16BE(4) + text.length, 4);
    extended.writeUInt32LE(text.length, tag(extended, 0x010f) + 4);
    extended.writeUInt32LE(end - 12, tag(extended, 0x010f) + 8);
    expect(await inspect(extended)).toMatchObject({
      status: 'DETECTED',
      observations: expect.arrayContaining([
        { kind: 'RECORDED', format: 'EXIF', field: 'cameraMake', value: 'A'.repeat(256) },
      ]),
    });
    extended.writeUInt32LE(258, tag(extended, 0x010f) + 4);
    await expect(inspect(extended)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('caps reads at 4 KiB independently of the APP1 allocation and checks cancellation after I/O', async () => {
    const original = fixture();
    const end = 4 + original.readUInt16BE(4);
    const padding = Buffer.alloc(10000);
    const bytes = Buffer.concat([original.subarray(0, end), padding, original.subarray(end)]);
    bytes.writeUInt16BE(original.readUInt16BE(4) + padding.length, 4);
    const lengths: number[] = [];
    let cancelled = false;
    const handle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        lengths.push(length);
        return bytes.subarray(offset, offset + length);
      },
    };
    expect(await jpegExifAdapter.read(media(bytes, handle), context)).toHaveProperty(
      'status',
      'DETECTED',
    );
    expect(Math.max(...lengths)).toBe(4096);
    // The segment payload limit is checked before the larger payload read.
    lengths.length = 0;
    await expect(
      jpegExifAdapter.read(media(bytes, handle), {
        ...context,
        limits: { ...DEFAULT_LIMITS, maxChunkBytes: 1024 },
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(Math.max(...lengths)).toBe(2);
    const cancellationHandle: MediaHandle = {
      sizeBytes: bytes.length,
      async read(offset, length) {
        cancelled = true;
        return bytes.subarray(offset, offset + length);
      },
    };
    await expect(
      jpegExifAdapter.read(media(bytes, cancellationHandle), {
        ...context,
        cancelled: () => cancelled,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('detects an empty classic TIFF directory without inventing recorded fields', async () => {
    const tiff = Buffer.from([73, 73, 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const jpeg = Buffer.concat([
      Buffer.from([255, 216, 255, 225, 0, 22, 69, 120, 105, 102, 0, 0]),
      tiff,
      Buffer.from([255, 217]),
    ]);
    expect(await inspect(jpeg)).toMatchObject({
      status: 'DETECTED',
      observations: [{ kind: 'RECORDED', format: 'EXIF', field: 'blockPresent', value: true }],
    });
  });

  it('never exposes unexpected exceptions across deterministic metadata mutations', async () => {
    const original = fixture();
    const end = 4 + original.readUInt16BE(4);
    for (let i = 6; i < end; i++) {
      const bytes = fixture();
      bytes[i] = (bytes[i] ?? 0) ^ 255;
      try {
        const r = await inspect(bytes);
        // The memory adapter cannot fail I/O; UNAVAILABLE would hide an unexpected parser error.
        expect(['DETECTED', 'NOT_DETECTED', 'INCONCLUSIVE']).toContain(r.status);
      } catch (error) {
        expect(error).toMatchObject({ code: 'RESOURCE_LIMIT' });
      }
    }
  });
});
