import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type MediaHandle } from '@media-auth/core';
import { createMemoryHandle, pngProbe } from './index.js';

const source = { acquisition: 'LOCAL_FILE' } as const;
const fixture = (): Uint8Array =>
  Uint8Array.from(readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url)));
const probe = (bytes: Uint8Array) => pngProbe.probe(createMemoryHandle(bytes), source);

function chunk(type: string, bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(bytes.length + 12);
  const view = new DataView(result.buffer);
  view.setUint32(0, bytes.length);
  result.set(Buffer.from(type, 'ascii'), 4);
  result.set(bytes, 8);
  view.setUint32(result.length - 4, crc32(result.subarray(4, result.length - 4)));
  return result;
}

function withHeader(change: (header: Uint8Array) => void): Uint8Array {
  const bytes = fixture();
  const header = bytes.slice(16, 29);
  change(header);
  bytes.set(chunk('IHDR', header), 8);
  return bytes;
}

function assemble(...chunks: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat([fixture().subarray(0, 8), ...chunks]));
}

describe('static PNG probe', () => {
  it('reports actual container observations and preserves acquisition context', async () => {
    const handle = createMemoryHandle(fixture());
    const descriptor = await pngProbe.probe(handle, {
      acquisition: 'SCREEN_CAPTURE',
      label: 'Selected capture',
    });
    expect(descriptor).toMatchObject({
      kind: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: handle.sizeBytes,
      metadataAvailability: 'NOT_PROBED',
      source: { acquisition: 'SCREEN_CAPTURE' },
    });
    expect(descriptor.dimensions?.width).toBeGreaterThan(0);
    expect(descriptor.limitations.join(' ')).toContain(
      'does not establish image decodability or authenticity',
    );
  });

  it('sniffs bytes instead of trusting file extension or claimed MIME', async () => {
    await expect(probe(Buffer.from('not an image'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
    });
    await expect(probe(new Uint8Array())).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
  });

  it('supports range-only access and does not advertise an unavailable stream', async () => {
    const complete = createMemoryHandle(fixture());
    const rangeOnly: MediaHandle = { sizeBytes: complete.sizeBytes, read: complete.read };
    const descriptor = await pngProbe.probe(rangeOnly, source);
    expect(descriptor.capabilities).toEqual(['RANGE_READ']);
    expect(descriptor.dimensions).toEqual({ width: 1, height: 1 });
  });

  it('rejects stream-only access without consuming the stream or inventing a probe result', async () => {
    let consumed = false;
    const streamOnly: MediaHandle = {
      sizeBytes: fixture().byteLength,
      async *stream() {
        consumed = true;
        yield fixture();
      },
    };
    await expect(pngProbe.probe(streamOnly, source)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
      message: 'The PNG probe requires byte-range access.',
    });
    expect(consumed).toBe(false);
  });

  it('rejects truncated chunks, missing image data, bad checksums, and trailing bytes', async () => {
    const bytes = fixture();
    await expect(probe(bytes.slice(0, -1))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      probe(assemble(bytes.slice(8, 33), chunk('IEND', new Uint8Array()))),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const corrupt = fixture();
    corrupt[29] = (corrupt[29] ?? 0) ^ 1;
    await expect(probe(corrupt)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(probe(new Uint8Array([...bytes, 0]))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects invalid header combinations independently of CRC checks', async () => {
    await expect(
      probe(withHeader((header) => new DataView(header.buffer).setUint32(0, 0))),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      probe(
        withHeader((header) => {
          header[8] = 3;
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      probe(
        withHeader((header) => {
          header[10] = 1;
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      probe(
        withHeader((header) => {
          header[12] = 2;
        }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('enforces byte, pixel, chunk-size, and chunk-count budgets', async () => {
    const bytes = fixture();
    const handle = createMemoryHandle(bytes);
    await expect(
      pngProbe.probe(handle, source, { ...DEFAULT_LIMITS, maxBytes: bytes.length - 1 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const enormous = withHeader((header) => {
      new DataView(header.buffer).setUint32(0, 100_000);
      new DataView(header.buffer).setUint32(4, 100_000);
    });
    await expect(probe(enormous)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(
      pngProbe.probe(handle, source, { ...DEFAULT_LIMITS, maxChunkBytes: 12 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(
      pngProbe.probe(handle, source, { ...DEFAULT_LIMITS, maxChunks: 1 }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(
      pngProbe.probe(handle, source, { ...DEFAULT_LIMITS, maxBytes: Number.NaN }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('rejects APNG and unknown critical chunks as unsupported, without implying malformed media', async () => {
    const bytes = fixture();
    for (const type of ['acTL', 'ABCD']) {
      await expect(
        probe(assemble(bytes.slice(8, 33), chunk(type, new Uint8Array(8)), bytes.slice(33))),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    }
  });

  it('requires a single first header, consecutive image data, and a valid indexed palette', async () => {
    const bytes = fixture();
    const header = bytes.slice(8, 33);
    const data = chunk('IDAT', new Uint8Array([1]));
    const end = chunk('IEND', new Uint8Array());
    await expect(probe(assemble(header, header, data, end))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(probe(assemble(data, header, end))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      probe(assemble(header, data, chunk('tEXt', new Uint8Array()), data, end)),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const indexed = withHeader((fields) => {
      fields[8] = 8;
      fields[9] = 3;
    });
    await expect(probe(indexed)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('does not decode image payloads and states this limitation', async () => {
    const bytes = assemble(
      fixture().slice(8, 33),
      chunk('IDAT', new Uint8Array([1])),
      chunk('IEND', new Uint8Array()),
    );
    const descriptor = await probe(bytes);
    expect(descriptor.limitations.join(' ')).toContain(
      'Pixel data and metadata payloads were not decoded',
    );
  });

  it('rejects dishonest range adapters', async () => {
    const handle: MediaHandle = {
      ...createMemoryHandle(fixture()),
      read: async () => new Uint8Array(),
    };
    await expect(pngProbe.probe(handle, source)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('scans large chunks with range reads bounded to 64 KiB', async () => {
    const bytes = assemble(
      fixture().slice(8, 33),
      chunk('IDAT', new Uint8Array(140_000)),
      chunk('IEND', new Uint8Array()),
    );
    const underlying = createMemoryHandle(bytes);
    const lengths: number[] = [];
    const handle: MediaHandle = {
      ...underlying,
      async read(offset, length) {
        lengths.push(length);
        return underlying.read(offset, length);
      },
    };
    await pngProbe.probe(handle, source);
    expect(Math.max(...lengths)).toBe(65_536);
  });
});

describe('memory acquisition handle', () => {
  it('copies Buffer inputs and each read, preserving a stable media snapshot', async () => {
    const bytes = Buffer.from([1, 2, 3]);
    const handle = createMemoryHandle(bytes);
    bytes[0] = 9;
    const first = await handle.read(0, 3);
    first[0] = 8;
    expect(await handle.read(0, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects invalid ranges and avoids allocating beyond its limit', async () => {
    const handle = createMemoryHandle(new Uint8Array(10));
    await expect(handle.read(-1, 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(handle.read(1, 10)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(handle.read(0.5, 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(() =>
      createMemoryHandle(new Uint8Array(10), { ...DEFAULT_LIMITS, maxBytes: 9 }),
    ).toThrow();
  });

  it('streams in bounded chunks from byte zero on every invocation', async () => {
    const handle = createMemoryHandle(new Uint8Array(70_000));
    const sizes: number[] = [];
    for await (const bytes of handle.stream()) sizes.push(bytes.length);
    expect(sizes).toEqual([65_536, 4_464]);
    expect(await handle.read(0, 0)).toEqual(new Uint8Array());
  });
});
