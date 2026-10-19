import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type MediaHandle,
  type ResourceLimits,
} from '@media-auth/core';
import { imageProbe, pngProbe } from '@media-auth/media';
import { buildCorpus, pngChunk, seeds } from './probe-corpus.js';

const source = { acquisition: 'LOCAL_FILE', label: 'misleading.dat' } as const;

/** Test-only guard. Assertion failures must escape the probe as unexpected errors. */
function guarded(bytes: Uint8Array, limits: ResourceLimits): MediaHandle {
  let reads = 0;
  return {
    sizeBytes: bytes.length,
    async read(offset, length) {
      assert.ok(Number.isSafeInteger(offset) && offset >= 0, 'invalid read offset');
      assert.ok(Number.isSafeInteger(length) && length > 0, 'invalid read length');
      assert.ok(length <= Math.min(65_536, limits.maxChunkBytes), 'read exceeds configured budget');
      assert.ok(offset <= bytes.length - length, 'read exceeds file extent');
      assert.ok(++reads <= 4 * bytes.length + 64, 'test read ceiling exceeded');
      return bytes.slice(offset, offset + length);
    },
  };
}

describe.each([
  ['direct', false],
  ['dispatched', true],
] as const)('%s named probe corpus', (_name, dispatch) => {
  it.each(buildCorpus())('$name', async (entry) => {
    const limits = { ...DEFAULT_LIMITS, ...entry.limits };
    const result = (dispatch ? imageProbe : entry.probe).probe(
      guarded(entry.bytes, limits),
      source,
      limits,
    );
    if (entry.expected !== 'ACCEPT') {
      await expect(result).rejects.toBeInstanceOf(MediaAuthError);
      await expect(result).rejects.toMatchObject({ code: entry.expected });
    } else {
      const seed = seeds.find((item) => entry.name === `${item.name}/positive-control`);
      if (!seed) throw new Error('Missing positive-control expectation.');
      expect(await result).toMatchObject({
        kind: 'IMAGE',
        mimeType: seed.mimeType,
        dimensions: { width: seed.width, height: seed.height },
        metadataAvailability: 'NOT_PROBED',
        capabilities: ['RANGE_READ'],
        source,
      });
    }
  });
});

describe('deterministic cross-format mutations', () => {
  it.each(seeds)('$name: all prefixes and three bit masks at every byte', async (seed) => {
    const variants: Uint8Array[] = [];
    for (let length = 0; length < seed.bytes.length; length++)
      variants.push(seed.bytes.subarray(0, length));
    for (let offset = 0; offset < seed.bytes.length; offset++) {
      for (const mask of [1, 0x80, 0xff]) {
        const bytes = Buffer.from(seed.bytes);
        bytes[offset] = (bytes[offset] ?? 0) ^ mask;
        variants.push(bytes);
      }
    }
    // Fixed finite input/read budgets; this is a reproducible regression sweep, not exhaustive fuzzing.
    const limits = { ...DEFAULT_LIMITS, maxBytes: 2048, maxChunkBytes: 1024, maxChunks: 64 };
    for (const [variant, bytes] of variants.entries()) {
      for (const probe of [seed.probe, imageProbe]) {
        const context = `${seed.name} variant ${variant}, ${probe.id}`;
        try {
          const descriptor = await probe.probe(guarded(bytes, limits), source, limits);
          expect(descriptor, context).toMatchObject({
            kind: 'IMAGE',
            mimeType: seed.mimeType,
            sizeBytes: bytes.length,
            source,
            metadataAvailability: 'NOT_PROBED',
            capabilities: ['RANGE_READ'],
          });
          const dimensions = descriptor.dimensions;
          assert.ok(dimensions, context);
          assert.ok(Number.isSafeInteger(dimensions.width) && dimensions.width > 0, context);
          assert.ok(Number.isSafeInteger(dimensions.height) && dimensions.height > 0, context);
          assert.ok(dimensions.width <= limits.maxPixels / dimensions.height, context);
          expect(descriptor.limitations.join(' '), context).toContain('authenticity');
        } catch (error) {
          // AssertionError/RangeError/TypeError from either the guard or parser must fail the test.
          expect(error, context).toBeInstanceOf(MediaAuthError);
          if (!(error instanceof MediaAuthError)) throw error;
          expect(['INVALID_INPUT', 'UNSUPPORTED_MEDIA', 'RESOURCE_LIMIT'], context).toContain(
            error.code,
          );
        }
      }
    }
    expect(variants).toHaveLength(seed.bytes.length * 4);
  });

  it('rejects cross-format concatenation without reading beyond the acquired file', async () => {
    for (const first of seeds)
      for (const second of seeds) {
        if (first.mimeType === second.mimeType) continue;
        const bytes = Buffer.concat([first.bytes, second.bytes]);
        await expect(
          imageProbe.probe(guarded(bytes, DEFAULT_LIMITS), source),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      }
  });
});

describe('PNG CRC read boundaries', () => {
  it.each([13, 40, 65_536, 65_537])(
    'checks CRC bytes across a %i-byte payload budget',
    async (budget) => {
      const seed = seeds.find((item) => item.name === 'known.png');
      if (!seed) throw new Error('Missing PNG seed');
      const limits = { ...DEFAULT_LIMITS, maxChunkBytes: budget };
      // One opaque IDAT payload; not asserted decodable. Its CRC crosses the request boundary.
      const chunk = pngChunk('IDAT', Buffer.alloc(budget, 0x5a));
      const bytes = Buffer.concat([
        seed.bytes.subarray(0, 33),
        chunk,
        pngChunk('IEND', Buffer.alloc(0)),
      ]);
      expect(await pngProbe.probe(guarded(bytes, limits), source, limits)).toMatchObject({
        dimensions: { width: 1, height: 1 },
      });
      for (const index of [41, 41 + Math.min(budget - 1, 65_531), 41 + budget - 1, 41 + budget]) {
        const corrupt = Buffer.from(bytes);
        corrupt[index] = (corrupt[index] ?? 0) ^ 1;
        await expect(
          pngProbe.probe(guarded(corrupt, limits), source, limits),
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      }
    },
  );
});
