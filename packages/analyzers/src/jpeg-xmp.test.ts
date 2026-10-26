import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  DEFAULT_LIMITS,
  type Media,
  type MediaHandle,
  type AnalysisContext,
} from '@media-auth/core';
import { createMemoryHandle, imageProbe } from '@media-auth/media';
import { createFoundationRegistry, jpegXmpAdapter } from './index.js';
import { nodeSha256Hasher } from './node.js';

const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };
const fixture = (name = 'xmp-attributes.jpg') =>
  readFileSync(new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url));
function media(bytes: Uint8Array, handle: MediaHandle = createMemoryHandle(bytes)): Media {
  return {
    descriptor: {
      kind: 'IMAGE',
      mimeType: 'image/jpeg',
      sizeBytes: bytes.length,
      source: { acquisition: 'LOCAL_FILE' },
      metadataAvailability: 'NOT_PROBED',
      capabilities: ['RANGE_READ'],
      limitations: [],
    },
    handle,
  };
}
const inspect = (bytes: Uint8Array, custom = context) => jpegXmpAdapter.read(media(bytes), custom);
function segment(payload: Uint8Array) {
  const head = Buffer.from([255, 225, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}
function carrier(xml: string) {
  return Buffer.concat([
    Buffer.from([255, 216]),
    segment(Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0'), Buffer.from(xml)])),
    Buffer.from([255, 217]),
  ]);
}
const xml =
  '<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><r:Description r:about=""/></r:RDF>';

describe('bounded recorded JPEG XMP', () => {
  it.each(['xmp-attributes.jpg', 'xmp-elements.jpg'])(
    'reports %s independently of EXIF/hash and preserves raw claims',
    async (name) => {
      const bytes = fixture(name),
        handle = createMemoryHandle(bytes);
      const descriptor = await imageProbe.probe(handle, { acquisition: 'LOCAL_FILE' });
      const report = await analyze(
        { descriptor, handle },
        createFoundationRegistry(nodeSha256Hasher),
      );
      const evidence = report.evidence.find((item) => item.source.id === 'media-auth.jpeg-xmp');
      expect(evidence).toMatchObject({
        status: 'DETECTED',
        source: { version: '0.1.0' },
        confidence: { kind: 'NOT_ASSESSED' },
        details: {
          kind: 'RECORDED',
          observations: expect.arrayContaining([
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
          ]),
        },
      });
      expect(evidence).not.toHaveProperty('details.dimensionComparison');
      expect(
        report.evidence.find((item) => item.source.id === 'media-auth.jpeg-exif'),
      ).toHaveProperty('status', 'DETECTED');
      expect(report.evidence.find((item) => item.category === 'EXACT_IDENTITY')).toHaveProperty(
        'status',
        'DETECTED',
      );
      expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
      expect(report.conclusion).toMatchObject({
        verdict: 'INCONCLUSIVE',
        origin: 'UNKNOWN',
        modification: 'UNKNOWN',
        provenance: 'UNAVAILABLE',
        confidence: { kind: 'NOT_ASSESSED' },
      });
      expect(report.analyzers).toHaveLength(12);
    },
  );
  it('keeps scoped absence, unsupported formats, missing ranges and I/O distinct', async () => {
    const bytes = readFileSync(new URL('../../../tests/fixtures/baseline.jpg', import.meta.url));
    expect(await inspect(bytes)).toMatchObject({
      status: 'NOT_DETECTED',
      scope: expect.stringContaining('before the first JPEG SOS/EOI'),
    });
    expect(
      await jpegXmpAdapter.read({ descriptor: media(bytes).descriptor }, context),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await jpegXmpAdapter.read(
        { ...media(bytes), descriptor: { ...media(bytes).descriptor, mimeType: 'image/png' } },
        context,
      ),
    ).toHaveProperty('status', 'UNAVAILABLE');
    expect(
      await jpegXmpAdapter.read(
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
      await jpegXmpAdapter.read(
        media(bytes, {
          sizeBytes: -1,
          async read() {
            throw Error('Must not read');
          },
        }),
        context,
      ),
    ).toHaveProperty('status', 'INCONCLUSIVE');
    const postscan = Buffer.concat([Buffer.from([255, 216, 255, 218]), fixture().subarray(2)]);
    expect(await inspect(postscan)).toHaveProperty('status', 'NOT_DETECTED');
  });
  it('rejects truncated carriers, duplicate/malformed identifiers, later failures and extended packets', async () => {
    const bytes = fixture();
    const end = 4 + bytes.readUInt16BE(4);
    for (let n = 0; n < end; n++)
      expect(await inspect(bytes.subarray(0, n))).toHaveProperty('status', 'INCONCLUSIVE');
    const duplicate = Buffer.concat([
      bytes.subarray(0, end),
      bytes.subarray(2, end),
      bytes.subarray(end),
    ]);
    const badId = Buffer.from(bytes);
    badId[34] = 1;
    const extended = segment(Buffer.from('http://ns.adobe.com/xmp/extension/\0Not reassembled'));
    const values = [
      duplicate,
      badId,
      Buffer.concat([bytes.subarray(0, end), Buffer.from([0, 0])]),
      Buffer.concat([bytes.subarray(0, end), extended, bytes.subarray(end)]),
      carrier('<!DOCTYPE x>' + xml),
      carrier(xml.replace('r:about=""', 'r:about="other"')),
    ];
    for (const value of values) {
      const result = await inspect(value);
      expect(result).toHaveProperty('status', 'INCONCLUSIVE');
      expect(result).not.toHaveProperty('observations');
    }
  });
  it('enforces exact input, segment, work, allocation, ranges and cancellation at the direct adapter', async () => {
    const original = carrier(xml);
    const pad = 65504 - Buffer.byteLength(xml);
    const exact = carrier(xml + ' '.repeat(pad));
    let maximum = 0;
    expect(
      await jpegXmpAdapter.read(
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
    for (const limits of [
      { maxBytes: original.length - 1 },
      { maxChunkBytes: 10 },
      { maxChunks: 1 },
      { maxChunks: 0 },
    ])
      await expect(
        inspect(original, { ...context, limits: { ...DEFAULT_LIMITS, ...limits } }),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const delta of [-1, 1])
      expect(
        await jpegXmpAdapter.read(
          media(original, {
            sizeBytes: original.length,
            async read(_offset, length) {
              return new Uint8Array(length + delta);
            },
          }),
          context,
        ),
      ).toHaveProperty('status', 'INCONCLUSIVE');
    await expect(inspect(original, { ...context, cancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    let cancelled = false;
    await expect(
      jpegXmpAdapter.read(
        media(original, {
          sizeBytes: original.length,
          async read(offset, length) {
            cancelled = true;
            return original.subarray(offset, offset + length);
          },
        }),
        { ...context, cancelled: () => cancelled },
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    const flood = Buffer.concat([
      Buffer.from([255, 216]),
      Buffer.alloc(100, 255),
      Buffer.from([217]),
    ]);
    await expect(
      inspect(flood, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 10 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });
  it('does not conceal unexpected parser exceptions in deterministic packet mutations', async () => {
    const original = carrier(xml);
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
