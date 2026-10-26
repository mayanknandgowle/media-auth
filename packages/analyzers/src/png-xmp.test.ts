import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  DEFAULT_LIMITS,
  type AnalysisContext,
  type Media,
  type MediaHandle,
} from '@media-auth/core';
import { createMemoryHandle, imageProbe } from '@media-auth/media';
import { createFoundationRegistry, pngXmpAdapter, pngExifAdapter } from './index.js';
import { nodeSha256Hasher } from './node.js';
const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };
const fixture = (name = 'xmp-attributes.png') =>
  readFileSync(new URL('../../../tests/fixtures/metadata/' + name, import.meta.url));
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
const inspect = (bytes: Uint8Array, custom = context) => pngXmpAdapter.read(media(bytes), custom);
function chunk(type: string, payload: Uint8Array) {
  const out = Buffer.alloc(payload.length + 12);
  out.writeUInt32BE(payload.length);
  out.write(type, 4);
  out.set(payload, 8);
  out.writeUInt32BE(crc32(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = (...chunks: Uint8Array[]) => Buffer.concat([signature, ...chunks]);
const base = fixture('exif-little.png');
function parts(bytes = base) {
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < bytes.length; offset += bytes.readUInt32BE(offset) + 12)
    chunks.push(bytes.subarray(offset, offset + bytes.readUInt32BE(offset) + 12));
  return chunks;
}
const [header, exif, image, end] = parts();
if (!header || !exif || !image || !end) throw Error('Expected fixture chunks');
const xml =
  '<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description r:about=""/></r:RDF>';
const payload = (packet = xml, flag = 0, method = 0, language = '', translated = '') =>
  Buffer.concat([
    Buffer.from('XML:com.adobe.xmp\0'),
    Buffer.from([flag, method]),
    Buffer.from(language + '\0' + translated + '\0'),
    Buffer.from(packet),
  ]);
const carrier = (packet = xml) => png(header, exif, chunk('iTXt', payload(packet)), image, end);
describe('bounded recorded static PNG XMP', () => {
  it.each(['attributes', 'elements'])(
    'reports %s claims separately from EXIF/hash through the pipeline',
    async (variant) => {
      const bytes = fixture(`xmp-${variant}.png`),
        handle = createMemoryHandle(bytes);
      const descriptor = await imageProbe.probe(handle, { acquisition: 'LOCAL_FILE' });
      const report = await analyze(
        { descriptor, handle },
        createFoundationRegistry(nodeSha256Hasher),
      );
      const evidence = report.evidence.find((item) => item.source.id === 'media-auth.png-xmp');
      expect(evidence).toMatchObject({
        status: 'DETECTED',
        source: { version: '0.1.0' },
        confidence: { kind: 'NOT_ASSESSED' },
        details: {
          kind: 'RECORDED',
          observations: [
            { kind: 'RECORDED', format: 'XMP', field: 'packetPresent', value: true },
            {
              kind: 'RECORDED',
              format: 'XMP',
              field: 'creatorTool',
              value: 'MediaAuth <fixture> & café 📷',
            },
            {
              kind: 'RECORDED',
              format: 'XMP',
              field: 'createDate',
              value: '2026-10-26T12:34:56+05:30',
            },
            {
              kind: 'RECORDED',
              format: 'XMP',
              field: 'modifyDate',
              value: '2026-10-26T12:35:00+05:30',
            },
            {
              kind: 'RECORDED',
              format: 'XMP',
              field: 'metadataDate',
              value: '2026-10-26T12:36:00+05:30',
            },
          ],
        },
      });
      expect(evidence).not.toHaveProperty('details.dimensionComparison');
      expect(
        report.evidence.find((item) => item.source.id === 'media-auth.png-exif'),
      ).toHaveProperty('status', 'DETECTED');
      expect(
        report.evidence.find((item) => item.source.id === 'media-auth.jpeg-xmp'),
      ).toHaveProperty('status', 'UNAVAILABLE');
      expect(report.evidence.find((item) => item.category === 'EXACT_IDENTITY')).toHaveProperty(
        'status',
        'DETECTED',
      );
      expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
      expect(report.media.metadataAvailability).toBe('NOT_PROBED');
      expect(report.analyzers).toHaveLength(13);
      expect(report.conclusion).toMatchObject({
        verdict: 'INCONCLUSIVE',
        origin: 'UNKNOWN',
        modification: 'UNKNOWN',
        provenance: 'UNAVAILABLE',
        confidence: { kind: 'NOT_ASSESSED' },
      });
    },
  );
  it('distinguishes scoped absence from unavailable MIME/access/I/O and invalid size', async () => {
    for (const bytes of [
      base,
      readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url)),
    ])
      expect(await inspect(bytes)).toMatchObject({
        status: 'NOT_DETECTED',
        scope: expect.stringContaining('CRC-checked static PNG datastream'),
      });
    const bytes = fixture();
    expect(
      await pngXmpAdapter.read({ descriptor: media(bytes).descriptor }, context),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await pngXmpAdapter.read(
        { ...media(bytes), descriptor: { ...media(bytes).descriptor, mimeType: 'image/jpeg' } },
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await pngXmpAdapter.read(
        media(bytes, {
          sizeBytes: bytes.length,
          async read() {
            throw Error('I/O');
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await pngXmpAdapter.read(
        media(bytes, {
          sizeBytes: -1,
          async read() {
            throw Error('Must not read');
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'INCONCLUSIVE');
  });

  it('accepts uncompressed packets on either side of IDAT and ignores the uncompressed method byte', async () => {
    for (const bytes of [
      carrier(),
      png(header, exif, image, chunk('iTXt', payload()), end),
      png(header, exif, chunk('iTXt', payload(xml, 0, 255)), image, end),
    ])
      expect(await inspect(bytes)).toHaveProperty('status', 'DETECTED');
    for (const name of ['xmp-attributes.png', 'xmp-elements.png'])
      expect(await pngExifAdapter.read(media(fixture(name)), context)).toHaveProperty(
        'status',
        'DETECTED',
      );
  });
  it('distinguishes exact keywords from unrelated opaque text and rejects unsupported carriers without inflating', async () => {
    for (const name of ['XML:com.adobe.xmp-suffix', 'xml:com.adobe.xmp', 'Other'])
      expect(
        await inspect(
          png(header, exif, chunk('iTXt', Buffer.from(name + '\0\0\0\0\0' + xml)), image, end),
        ),
      ).toHaveProperty('status', 'NOT_DETECTED');
    const compressed = Buffer.concat([
      Buffer.from('XML:com.adobe.xmp\0\x01\0\0\0'),
      deflateSync(Buffer.from('x'.repeat(128000))),
    ]);
    for (const [type, bytes] of [
      ['iTXt', compressed],
      ['iTXt', payload(xml, 2)],
      ['iTXt', payload(xml, 0, 0, 'en')],
      ['iTXt', payload(xml, 0, 0, '', 'XMP')],
      ['iTXt', Buffer.from('XML:com.adobe.xmp\0\0')],
      ['iTXt', Buffer.from('XML:com.adobe.xmp')],
      ['tEXt', Buffer.from('XML:com.adobe.xmp\0' + xml)],
      ['zTXt', Buffer.from('XML:com.adobe.xmp\0\0invalid compressed bytes')],
      ['iTXt', Buffer.from(' bad\0ignored')],
      ['iTXt', Buffer.from('Bad  key\0ignored')],
      ['iTXt', Buffer.from('x'.repeat(80) + '\0ignored')],
      ['iTXt', new Uint8Array()],
    ] as const) {
      const result = await inspect(png(header, exif, chunk(type, bytes), image, end));
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
    }
  });
  it('retains the exact keyword/packet bytes checked by CRC with no metadata reread', async () => {
    const bytes = fixture();
    const offset = 33 + exif.length,
      length = bytes.readUInt32BE(offset);
    let reads = 0;
    const result = await pngXmpAdapter.read(
      media(bytes, {
        sizeBytes: bytes.length,
        async read(start, count) {
          if (start === offset + 8) reads++;
          if (start === offset + 8 + length) bytes[offset + 8] = 88;
          return bytes.subarray(start, start + count);
        },
      }),
      context,
    );
    expect(reads).toBe(1);
    expect(result).toMatchObject({
      status: 'DETECTED',
      observations: expect.arrayContaining([
        {
          kind: 'RECORDED',
          format: 'XMP',
          field: 'creatorTool',
          value: 'MediaAuth <fixture> & café 📷',
        },
      ]),
    });
  });
  it('rejects duplicate packets, every truncated prefix, trailing input and CRC damage in every chunk', async () => {
    const original = carrier();
    for (let n = 0; n < original.length; n++)
      expect(await inspect(original.subarray(0, n))).toHaveProperty('status', 'INCONCLUSIVE');
    const packet = chunk('iTXt', payload());
    for (const bytes of [
      png(header, exif, packet, image, packet, end),
      Buffer.concat([original, Buffer.from([0])]),
    ])
      expect(await inspect(bytes)).toHaveProperty('status', 'INCONCLUSIVE');
    for (let offset = 8; offset < original.length;) {
      const bytes = Buffer.from(original),
        next = offset + bytes.readUInt32BE(offset) + 12;
      bytes[next - 1] = (bytes[next - 1] ?? 0) ^ 1;
      const result = await inspect(bytes);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
      offset = next;
    }
    const later = chunk('tEXt', Buffer.from('Other\0ignored'));
    later[later.length - 1] = (later[later.length - 1] ?? 0) ^ 1;
    expect(await inspect(png(header, exif, packet, image, later, end))).toHaveProperty(
      'status',
      'INCONCLUSIVE',
    );
  });
  it('rejects static framing/order/animation failures after valid CRCs and unsupported XML without harming EXIF', async () => {
    const packet = chunk('iTXt', payload());
    for (const bytes of [
      png(exif, header, packet, image, end),
      png(header, header, exif, packet, image, end),
      png(chunk('IHDR', new Uint8Array(12)), packet, image, end),
      png(header, packet, end),
      png(header, packet, image),
      png(header, packet, chunk('IDAT', new Uint8Array()), end),
      png(header, packet, image, packet, image, end),
      png(header, packet, image, chunk('IEND', Buffer.from([0]))),
      png(header, packet, chunk('ABCD', new Uint8Array()), image, end),
      png(header, packet, chunk('acTL', new Uint8Array(8)), image, end),
      png(header, packet, chunk('fcTL', new Uint8Array(26)), image, end),
      png(header, packet, chunk('fdAT', new Uint8Array(4)), image, end),
      png(header, packet, image, chunk('PLTE', new Uint8Array(3)), end),
      png(header, packet, chunk('PLTE', new Uint8Array(2)), image, end),
    ]) {
      const result = await inspect(bytes);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
    }
    for (const text of [
      '<!DOCTYPE x>' + xml,
      xml.replace('r:about=""', 'r:about="other"'),
      'http://ns.adobe.com/xap/1.0/\0' + xml,
    ]) {
      const bytes = carrier(text);
      expect(await inspect(bytes)).toHaveProperty('status', 'INCONCLUSIVE');
      expect(await pngExifAdapter.read(media(bytes), context)).toHaveProperty('status', 'DETECTED');
    }
    const invalidUtf8 = png(
      header,
      exif,
      chunk('iTXt', Buffer.concat([payload(''), Buffer.from([255])])),
      image,
      end,
    );
    expect(await inspect(invalidUtf8)).toHaveProperty('status', 'INCONCLUSIVE');
  });
  it('bounds retained allocation, packet/read/input/chunk/work budgets independently', async () => {
    const exact = carrier(xml + ' '.repeat(65504 - Buffer.byteLength(xml)));
    let maximum = 0;
    expect(
      await pngXmpAdapter.read(
        media(exact, {
          sizeBytes: exact.length,
          async read(offset, length) {
            maximum = Math.max(maximum, length);
            expect(offset + length).toBeLessThanOrEqual(exact.length);
            return exact.subarray(offset, offset + length);
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'DETECTED');
    expect(maximum).toBe(4096);
    const over = carrier(xml + ' '.repeat(65505 - Buffer.byteLength(xml)));
    let selectedReads = 0;
    await expect(
      pngXmpAdapter.read(
        media(over, {
          sizeBytes: over.length,
          async read(offset, length) {
            if (offset >= 33 + exif.length + 8) selectedReads++;
            return over.subarray(offset, offset + length);
          },
        }),
        context,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(selectedReads).toBe(1);
    const original = carrier();
    expect(
      await inspect(original, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 14 } }),
    ).toHaveProperty('status', 'DETECTED');
    for (const limits of [
      { maxChunks: 13 },
      { maxChunks: 0 },
      { maxBytes: original.length - 1 },
      { maxChunkBytes: 269 },
    ])
      await expect(
        inspect(original, { ...context, limits: { ...DEFAULT_LIMITS, ...limits } }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const selected = fixture(),
      length = selected.readUInt32BE(33 + exif.length);
    expect(
      await inspect(selected, { ...context, limits: { ...DEFAULT_LIMITS, maxChunkBytes: length } }),
    ).toHaveProperty('status', 'DETECTED');
    await expect(
      inspect(selected, { ...context, limits: { ...DEFAULT_LIMITS, maxChunkBytes: length - 1 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const flood = png(
      header,
      ...Array.from({ length: 20 }, () => chunk('tEXt', Buffer.from('Other\0opaque'))),
      exif,
      chunk('iTXt', payload()),
      image,
      end,
    );
    await expect(
      inspect(flood, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 10 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(
      await inspect(
        png(
          header,
          chunk('iTXt', Buffer.from('Other\0' + 'x'.repeat(70000))),
          exif,
          chunk('iTXt', payload()),
          image,
          end,
        ),
      ),
    ).toHaveProperty('status', 'DETECTED');
  });
  it('rejects inexact ranges and cancels before/after I/O and at XML work', async () => {
    const bytes = carrier();
    for (const delta of [-1, 1])
      expect(
        await pngXmpAdapter.read(
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
      pngXmpAdapter.read(
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
    let terminal = false,
      polls = 0;
    await expect(
      pngXmpAdapter.read(
        media(bytes, {
          sizeBytes: bytes.length,
          async read(offset, length) {
            if (offset === bytes.length - 4) terminal = true;
            return bytes.subarray(offset, offset + length);
          },
        }),
        { ...context, cancelled: () => terminal && ++polls > 1 },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('keeps deterministic mutations in explicit states and typed resource failures', async () => {
    const original = carrier();
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
