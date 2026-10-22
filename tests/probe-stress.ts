import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type MediaProbe,
  type ResourceLimits,
} from '@media-auth/core';
import { imageProbe } from '@media-auth/media';
import type { ProbeSeed } from './probe-seeds.js';

export const STRESS_VERSION = '1';
export const MAX_INPUT = 16_384;
const source = { acquisition: 'LOCAL_FILE', label: 'generated-stress-case' } as const;

/** Each case has its own PRNG state, allowing replay without running preceding cases. */
export function generateCase(seed: number, index: number, fixtures: readonly ProbeSeed[]) {
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  assert.ok(Number.isInteger(index) && index >= 0 && index <= 999_999);
  const fixture = fixtures[index % fixtures.length];
  assert.ok(fixture && fixture.bytes.length <= MAX_INPUT);
  let state = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  function random(bound: number): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state >>> 8) % bound;
  }
  let bytes: Uint8Array = Uint8Array.from(fixture.bytes);
  const edits = 1 + random(8);
  for (let edit = 0; edit < edits; edit++) {
    const position = random(bytes.length + 1);
    switch (random(6)) {
      case 0: {
        if (position < bytes.length) bytes[position] = (bytes[position] ?? 0) ^ (1 << random(8));
        break;
      }
      case 1: {
        // Overwrite a short field, including length and dimension fields.
        const count = Math.min(1 + random(8), bytes.length - position);
        bytes.fill(random(256), position, position + count);
        break;
      }
      case 2: {
        const count = Math.min(1 + random(256), MAX_INPUT - bytes.length);
        const inserted = new Uint8Array(count).fill(random(256));
        bytes = Buffer.concat([bytes.subarray(0, position), inserted, bytes.subarray(position)]);
        break;
      }
      case 3: {
        const count = 1 + random(256);
        bytes = Buffer.concat([bytes.subarray(0, position), bytes.subarray(position + count)]);
        break;
      }
      case 4: {
        bytes = bytes.slice(0, position);
        break;
      }
      case 5: {
        // Repeated seed data explores concatenations and larger opaque regions.
        const other = fixtures[random(fixtures.length)];
        assert.ok(other);
        const count = Math.min(random(4097), MAX_INPUT - bytes.length);
        const repeated = new Uint8Array(count);
        for (let i = 0; i < count; i++) repeated[i] = other.bytes[i % other.bytes.length] ?? 0;
        bytes = Buffer.concat([bytes.subarray(0, position), repeated, bytes.subarray(position)]);
        break;
      }
    }
  }
  const policy = Math.floor(index / fixtures.length) % 4;
  const limits: ResourceLimits = {
    maxBytes: policy === 0 ? 512 : MAX_INPUT,
    maxPixels: policy === 1 ? 64 : DEFAULT_LIMITS.maxPixels,
    maxChunkBytes: policy === 2 ? 2 : 4096,
    maxChunks: policy === 3 ? 8 : 256,
  };
  return { fixture, bytes, limits, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Unexpected exceptions and adapter violations must fail, even if later caught by a probe. */
export async function checkProbe(probe: MediaProbe, bytes: Uint8Array, limits: ResourceLimits) {
  let reads = 0;
  let violation: Error | undefined;
  const handle = {
    sizeBytes: bytes.length,
    async read(offset: number, length: number) {
      try {
        assert.ok(Number.isSafeInteger(offset) && offset >= 0, 'invalid offset');
        assert.ok(Number.isSafeInteger(length) && length > 0, 'invalid length');
        assert.ok(length <= Math.min(65_536, limits.maxChunkBytes), 'read budget exceeded');
        assert.ok(offset <= bytes.length - length, 'read beyond input');
        assert.ok(++reads <= 4 * bytes.length + 64, 'read count ceiling exceeded');
      } catch (error) {
        violation = error instanceof Error ? error : new Error('Range guard failed');
        throw violation;
      }
      return bytes.slice(offset, offset + length);
    },
  };
  try {
    const result = await probe.probe(handle, source, limits);
    if (violation) throw violation;
    assert.equal(result.kind, 'IMAGE');
    assert.ok(
      ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(result.mimeType),
    );
    assert.equal(result.sizeBytes, bytes.length);
    assert.deepEqual(result.source, source);
    assert.equal(result.metadataAvailability, 'NOT_PROBED');
    assert.deepEqual(result.capabilities, ['RANGE_READ']);
    assert.equal(result.contentHash, undefined);
    assert.ok(result.dimensions);
    const { width, height } = result.dimensions;
    assert.ok(Number.isSafeInteger(width) && width > 0);
    assert.ok(Number.isSafeInteger(height) && height > 0);
    assert.ok(width <= limits.maxPixels / height);
    assert.ok(bytes.length <= limits.maxBytes);
    assert.ok(result.limitations.join(' ').includes('authenticity'));
    return { status: 'ACCEPT', mimeType: result.mimeType, width, height };
  } catch (error) {
    if (violation) throw violation;
    if (!(error instanceof MediaAuthError)) throw error;
    assert.ok(['INVALID_INPUT', 'UNSUPPORTED_MEDIA', 'RESOURCE_LIMIT'].includes(error.code));
    return { status: error.code };
  }
}

export async function exerciseCase(entry: ReturnType<typeof generateCase>) {
  const direct = await checkProbe(entry.fixture.probe, entry.bytes, entry.limits);
  const dispatched = await checkProbe(imageProbe, entry.bytes, entry.limits);
  if (direct.status === 'ACCEPT') assert.equal(direct.mimeType, entry.fixture.mimeType);
  // Splicing can create another format. Compare acceptance only for the original format.
  if (
    direct.status === 'ACCEPT' ||
    (dispatched.status === 'ACCEPT' && dispatched.mimeType === entry.fixture.mimeType)
  )
    assert.deepEqual(direct, dispatched, 'direct/dispatched acceptance differs');
  return { direct, dispatched };
}
