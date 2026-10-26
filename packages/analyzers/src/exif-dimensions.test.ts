import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { analyze, MediaAuthError } from '@media-auth/core';
import { createMemoryHandle, imageProbe } from '@media-auth/media';
import {
  compareExifDimensions,
  createFoundationRegistry,
  type MetadataObservation,
} from './index.js';
import { readExifTiff } from './exif-tiff.js';
import { nodeSha256Hasher } from './node.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url));
function tiff(different = false) {
  const bytes = fixture(`dimensions-${different ? 'different' : 'match'}.jpg`);
  return Buffer.from(bytes.subarray(12, 4 + bytes.readUInt16BE(4)));
}
function slot(bytes: Buffer, tag: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes.toString('ascii', 0, 2) === 'II';
  const root = view.getUint32(4, little);
  function find(start: number, id: number) {
    for (let i = 0; i < view.getUint16(start, little); i++) {
      const entry = start + 2 + i * 12;
      if (view.getUint16(entry, little) === id) return entry;
    }
    throw new Error('Missing fixture tag');
  }
  const sub = view.getUint32(find(root, 0x8769) + 8, little);
  return { view, little, entry: find(sub, tag) };
}
const observation = (field: string, value: number): MetadataObservation => ({
  kind: 'RECORDED',
  format: 'EXIF',
  field,
  value,
});

describe('recorded EXIF dimensions', () => {
  it.each(['jpg', 'webp', 'png'])(
    'discards partial %s fields for invalid dimensions while preserving independent identity',
    async (format) => {
      const bytes = fixture(`dimensions-match.${format}`);
      const start = format === 'jpg' ? 12 : format === 'png' ? 41 : 64;
      const { view, little, entry } = slot(bytes.subarray(start), 0xa002);
      view.setUint32(entry + 4, 2, little);
      if (format === 'png') {
        const end = 41 + bytes.readUInt32BE(33);
        bytes.writeUInt32BE(crc32(bytes.subarray(37, end)), end);
      }
      const handle = createMemoryHandle(bytes);
      const descriptor = await imageProbe.probe(handle, { acquisition: 'LOCAL_FILE' });
      const report = await analyze(
        { descriptor, handle },
        createFoundationRegistry(nodeSha256Hasher),
      );
      const evidence = report.evidence.find(
        (item) => item.source.id === `media-auth.${format === 'jpg' ? 'jpeg' : format}-exif`,
      );
      expect(evidence).toHaveProperty('status', 'INCONCLUSIVE');
      expect(evidence).not.toHaveProperty('details');
      expect(report.evidence.find((item) => item.category === 'EXACT_IDENTITY')).toHaveProperty(
        'status',
        'DETECTED',
      );
    },
  );
  it.each(['jpg', 'webp', 'png'])(
    'compares complete %s pairs in real analysis without applying orientation or inferring origin',
    async (format) => {
      for (const different of [false, true]) {
        const bytes = fixture(`dimensions-${different ? 'different' : 'match'}.${format}`);
        const handle = createMemoryHandle(bytes);
        const descriptor = await imageProbe.probe(handle, { acquisition: 'LOCAL_FILE' });
        const report = await analyze(
          { descriptor, handle },
          createFoundationRegistry(nodeSha256Hasher),
        );
        const source = `media-auth.${format === 'jpg' ? 'jpeg' : format}-exif`;
        expect(report.evidence.find((item) => item.source.id === source)).toMatchObject({
          source: { version: '0.2.0' },
          status: 'DETECTED',
          confidence: { kind: 'NOT_ASSESSED' },
          details: {
            kind: 'RECORDED',
            observations: expect.arrayContaining([
              observation('pixelXDimension', different ? 32 : 16),
              observation('pixelYDimension', different ? 16 : 8),
              observation('orientation', different ? 1 : 6),
            ]),
            dimensionComparison: {
              kind: 'NUMERIC_COMPARISON',
              status: different ? 'DIFFERENT' : 'MATCH',
              recorded: { width: different ? 32 : 16, height: different ? 16 : 8 },
              encoded: { width: 16, height: 8 },
            },
          },
        });
        expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
        expect(report.conclusion).toMatchObject({
          verdict: 'INCONCLUSIVE',
          origin: 'UNKNOWN',
          modification: 'UNKNOWN',
          provenance: 'UNAVAILABLE',
          confidence: { kind: 'NOT_ASSESSED' },
        });
        expect(report.analyzers).toHaveLength(11);
        expect(report.limitations.join(' ')).toContain('legitimate JPEG padding');
      }
    },
  );

  it.each([false, true])(
    'supports SHORT and LONG in each endian (big=%s) without using claims for pixel allocation',
    (big) => {
      for (const type of [3, 4]) {
        const bytes = tiff(big);
        for (const [tag, value] of [
          [0xa002, type === 3 ? 65535 : 0xffffffff],
          [0xa003, 8],
        ] as const) {
          const { view, little, entry } = slot(bytes, tag);
          view.setUint16(entry + 2, type, little);
          view.setUint32(entry + 8, 0, little);
          if (type === 3) view.setUint16(entry + 8, value, little);
          else view.setUint32(entry + 8, value, little);
        }
        const observations = readExifTiff(bytes, () => {});
        expect(observations).toContainEqual(
          observation('pixelXDimension', type === 3 ? 65535 : 0xffffffff),
        );
        expect(compareExifDimensions(observations, { width: 16, height: 8 })).toHaveProperty(
          'status',
          'DIFFERENT',
        );
      }
    },
  );

  it.each([false, true])(
    'rejects malformed selected scalars without partial observations (big=%s)',
    (big) => {
      for (const tag of [0xa002, 0xa003])
        for (const variant of ['type', 'zero', 'count', 'huge count', 'duplicate']) {
          const bytes = tiff(big);
          const { view, little, entry } = slot(bytes, tag);
          if (variant === 'type') view.setUint16(entry + 2, 7, little);
          if (variant === 'zero') view.setUint32(entry + 8, 0, little);
          if (variant === 'count') view.setUint32(entry + 4, 2, little);
          if (variant === 'huge count') view.setUint32(entry + 4, 0xffffffff, little);
          if (variant === 'duplicate')
            view.setUint16(entry, tag === 0xa002 ? 0xa003 : 0xa002, little);
          expect(() => readExifTiff(bytes, () => {})).toThrow(
            expect.objectContaining({ code: 'INVALID_INPUT' }),
          );
        }
    },
  );

  it('records a partial pair while refusing to compare it, and preserves the exact entry work budget', () => {
    const bytes = tiff();
    let work = 0;
    readExifTiff(bytes, () => {
      work++;
    });
    expect(work).toBe(12);
    work = 0;
    expect(() =>
      readExifTiff(bytes, () => {
        if (++work > 11) throw new MediaAuthError('RESOURCE_LIMIT', 'test budget');
      }),
    ).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }));
    const { view, little, entry } = slot(bytes, 0xa003);
    view.setUint16(entry, 0x9999, little);
    const observations = readExifTiff(bytes, () => {});
    expect(observations).toContainEqual(observation('pixelXDimension', 16));
    expect(observations.some((item) => item.field === 'pixelYDimension')).toBe(false);
    expect(compareExifDimensions(observations, { width: 16, height: 8 })).toHaveProperty(
      'status',
      'NOT_COMPARABLE',
    );
  });

  it('does not invent agreement for absent, ambiguous, invalid or non-EXIF fields/dimensions', () => {
    const pair = [observation('pixelXDimension', 16), observation('pixelYDimension', 8)] as const;
    for (const observations of [
      [],
      pair.slice(0, 1),
      [...pair, pair[0]],
      [observation('pixelXDimension', 0), pair[1]],
      [observation('pixelXDimension', NaN), pair[1]],
      pair.map((item) => ({ ...item, format: 'CONTAINER' as const })),
    ])
      expect(compareExifDimensions(observations, { width: 16, height: 8 })).toHaveProperty(
        'status',
        'NOT_COMPARABLE',
      );
    for (const encoded of [
      undefined,
      { width: 0, height: 8 },
      { width: 16, height: 0.5 },
      { width: Infinity, height: 8 },
    ])
      expect(compareExifDimensions(pair, encoded)).toHaveProperty('status', 'NOT_COMPARABLE');
    // A historical/padded valid-width claim is only a numeric difference, never a cause.
    expect(
      compareExifDimensions(
        [observation('pixelXDimension', 620), observation('pixelYDimension', 480)],
        { width: 640, height: 480 },
      ),
    ).toMatchObject({
      status: 'DIFFERENT',
      recorded: { width: 620, height: 480 },
      encoded: { width: 640, height: 480 },
    });
  });
});
