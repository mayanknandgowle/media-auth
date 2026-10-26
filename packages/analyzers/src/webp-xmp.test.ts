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
import { createFoundationRegistry, webpXmpAdapter, webpExifAdapter } from './index.js';
import { nodeSha256Hasher } from './node.js';

const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };
const fixture = (name = 'xmp-attributes.webp') =>
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
const inspect = (bytes: Uint8Array, custom = context) => webpXmpAdapter.read(media(bytes), custom);
function chunk(tag: string, payload: Uint8Array) {
  const out = Buffer.alloc(8 + payload.length + (payload.length % 2));
  out.write(tag);
  out.writeUInt32LE(payload.length, 4);
  out.set(payload, 8);
  return out;
}
function riff(...chunks: Uint8Array[]) {
  const out = Buffer.concat([Buffer.from('RIFF0000WEBP'), ...chunks]);
  out.writeUInt32LE(out.length - 8, 4);
  return out;
}
const base = fixture('exif-little.webp');
const extended = Buffer.from(base.subarray(12, 30));
extended[8] = 12;
const image = base.subarray(30, 56),
  exif = base.subarray(56);
const xml =
  '<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description r:about=""/></r:RDF>';
const carrier = (packet = xml) => riff(extended, image, exif, chunk('XMP ', Buffer.from(packet)));

describe('bounded recorded static WebP XMP', () => {
  it.each(['attributes', 'elements'])(
    'reports %s claims separately from EXIF/hash through the pipeline',
    async (variant) => {
      const bytes = fixture(`xmp-${variant}.webp`),
        handle = createMemoryHandle(bytes);
      const descriptor = await imageProbe.probe(handle, { acquisition: 'LOCAL_FILE' });
      const report = await analyze(
        { descriptor, handle },
        createFoundationRegistry(nodeSha256Hasher),
      );
      const evidence = report.evidence.find((item) => item.source.id === 'media-auth.webp-xmp');
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
        report.evidence.find((item) => item.source.id === 'media-auth.webp-exif'),
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
      expect(report.analyzers).toHaveLength(12);
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
      readFileSync(new URL('../../../tests/fixtures/lossless.webp', import.meta.url)),
    ])
      expect(await inspect(bytes)).toMatchObject({
        status: 'NOT_DETECTED',
        scope: expect.stringContaining('exact static WebP RIFF extent'),
      });
    const bytes = fixture();
    expect(
      await webpXmpAdapter.read({ descriptor: media(bytes).descriptor }, context),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await webpXmpAdapter.read(
        { ...media(bytes), descriptor: { ...media(bytes).descriptor, mimeType: 'image/jpeg' } },
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await webpXmpAdapter.read(
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
      await webpXmpAdapter.read(
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
  it('accepts raw packets before/after image data and rejects JPEG identifiers and unsupported XML without harming EXIF', async () => {
    const packet = chunk('XMP ', Buffer.from(xml));
    for (const bytes of [riff(extended, packet, image, exif), riff(extended, image, exif, packet)])
      expect(await inspect(bytes)).toHaveProperty('status', 'DETECTED');
    for (const text of [
      'http://ns.adobe.com/xap/1.0/\0' + xml,
      '<!DOCTYPE x>' + xml,
      xml.replace('r:about=""', 'r:about="other"'),
      xml.replace(
        '/></r:RDF>',
        ' xmlns:n="http://ns.adobe.com/xmp/note/" n:HasExtendedXMP="x"/></r:RDF>',
      ),
    ]) {
      const bytes = carrier(text);
      expect(await inspect(bytes)).toHaveProperty('status', 'INCONCLUSIVE');
      expect(await webpExifAdapter.read(media(bytes), context)).toHaveProperty(
        'status',
        'DETECTED',
      );
    }
    expect(
      await inspect(riff(extended, image, exif, chunk('XMP ', Buffer.from([255])))),
    ).toHaveProperty('status', 'INCONCLUSIVE');
  });
  it('rejects every truncated carrier prefix, trailing bytes and incorrect RIFF signatures/extents', async () => {
    const original = carrier();
    for (let n = 0; n < original.length; n++)
      expect(await inspect(original.subarray(0, n))).toHaveProperty('status', 'INCONCLUSIVE');
    const badRiff = Buffer.from(original);
    badRiff[0] = 0;
    const badWebp = Buffer.from(original);
    badWebp[8] = 0;
    const odd = Buffer.from(original);
    odd.writeUInt32LE(odd.length - 9, 4);
    for (const bytes of [badRiff, badWebp, odd, Buffer.concat([original, Buffer.from([0, 0])])]) {
      const result = await inspect(bytes);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
    }
  });
  it('rejects duplicates, flags, animation, padding and later failures without partial fields', async () => {
    const packet = chunk('XMP ', Buffer.from(xml));
    const noFlag = Buffer.from(extended);
    noFlag[8] = 8;
    const animated = Buffer.from(extended);
    animated[8] = 14;
    const padding = chunk('JUNK', Buffer.from([1]));
    padding[9] = 1;
    const overflow = chunk('JUNK', Buffer.from([0, 0]));
    overflow.writeUInt32LE(4, 4);
    for (const bytes of [
      riff(extended, image, exif, packet, packet),
      riff(noFlag, image, exif, packet),
      riff(extended, image, exif),
      riff(animated, image, exif, packet),
      riff(extended, image, exif, packet, chunk('ANIM', new Uint8Array())),
      riff(extended, image, exif, packet, chunk('ANMF', new Uint8Array())),
      riff(extended, image, exif, packet, padding),
      riff(extended, image, exif, packet, overflow),
      riff(image, packet),
      riff(extended, exif, packet),
      riff(extended, image, image, exif, packet),
      riff(extended, image, packet, extended),
      riff(chunk('VP8X', new Uint8Array(9)), image, packet),
      riff(extended, chunk('VP8L', new Uint8Array()), packet),
      riff(extended, image, exif, chunk('XMP ', new Uint8Array())),
    ]) {
      const result = await inspect(bytes);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
    }
    // Correct zero padding in an opaque chunk stays acceptable.
    expect(
      await inspect(riff(extended, image, exif, packet, chunk('JUNK', Buffer.from([1])))),
    ).toHaveProperty('status', 'DETECTED');
  });
  it('enforces project allocation ceiling before payload reads and bounds reads/input/chunks/work', async () => {
    const original = carrier();
    expect(
      await inspect(original, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 9 } }),
    ).toHaveProperty('status', 'DETECTED');
    await expect(
      inspect(original, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 8 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const selected = fixture();
    const selectedLength = selected.readUInt32LE(base.length + 4);
    expect(
      await inspect(selected, {
        ...context,
        limits: { ...DEFAULT_LIMITS, maxChunkBytes: selectedLength },
      }),
    ).toHaveProperty('status', 'DETECTED');
    await expect(
      inspect(selected, {
        ...context,
        limits: { ...DEFAULT_LIMITS, maxChunkBytes: selectedLength - 1 },
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const exact = carrier(xml + ' '.repeat(65504 - Buffer.byteLength(xml)));
    let maximum = 0;
    expect(
      await webpXmpAdapter.read(
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
    maximum = 0;
    await expect(
      webpXmpAdapter.read(
        media(over, {
          sizeBytes: over.length,
          async read(offset, length) {
            maximum = Math.max(maximum, length);
            return over.subarray(offset, offset + length);
          },
        }),
        context,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    expect(maximum).toBeLessThanOrEqual(12);
    for (const limits of [
      { maxBytes: original.length - 1 },
      { maxChunkBytes: 269 },
      { maxChunks: 1 },
      { maxChunks: 0 },
    ])
      await expect(
        inspect(original, { ...context, limits: { ...DEFAULT_LIMITS, ...limits } }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const flood = riff(
      extended,
      image,
      exif,
      ...Array.from({ length: 20 }, () => chunk('JUNK', new Uint8Array())),
      chunk('XMP ', Buffer.from(xml)),
    );
    await expect(
      inspect(flood, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 10 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });
  it('rejects inexact byte ranges and propagates cancellation before/after I/O and during XML work', async () => {
    const bytes = carrier();
    for (const delta of [-1, 1])
      expect(
        await webpXmpAdapter.read(
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
      webpXmpAdapter.read(
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
    let payloadRead = false;
    let polls = 0;
    await expect(
      webpXmpAdapter.read(
        media(bytes, {
          sizeBytes: bytes.length,
          async read(offset, length) {
            if (offset === base.length + 8) payloadRead = true;
            return bytes.subarray(offset, offset + length);
          },
        }),
        { ...context, cancelled: () => payloadRead && ++polls > 1 },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });
  it('keeps deterministic packet mutations within explicit outcomes and typed resource failures', async () => {
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
