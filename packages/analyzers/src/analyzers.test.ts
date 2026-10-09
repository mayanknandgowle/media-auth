import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  DEFAULT_LIMITS,
  type AnalysisContext,
  type Media,
  type MediaHandle,
} from '@media-auth/core';
import { createMemoryHandle, pngProbe } from '@media-auth/media';
import { createFoundationRegistry } from './index.js';
import { nodeSha256Hasher } from './node.js';
import { webSha256Hasher } from './web.js';

const context: AnalysisContext = { limits: DEFAULT_LIMITS, cancelled: () => false };

describe.each([
  ['Node', nodeSha256Hasher],
  ['WebCrypto', webSha256Hasher],
] as const)('%s native SHA-256', (_name, hasher) => {
  it('matches independent published empty and abc SHA-256 vectors', async () => {
    expect(await hasher.hash(createMemoryHandle(new Uint8Array()), context)).toEqual({
      algorithm: 'SHA-256',
      value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
    expect(await hasher.hash(createMemoryHandle(Buffer.from('abc')), context)).toEqual({
      algorithm: 'SHA-256',
      value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
  });

  it('hashes stream-only inputs and explicitly rejects inputs without stream access', async () => {
    const complete = createMemoryHandle(Buffer.from('abc'));
    const streamOnly: MediaHandle = { sizeBytes: 3, stream: complete.stream };
    expect(await hasher.hash(streamOnly, context)).toEqual({
      algorithm: 'SHA-256',
      value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
    const rangeOnly: MediaHandle = { sizeBytes: 3, read: complete.read };
    await expect(hasher.hash(rangeOnly, context)).rejects.toMatchObject({
      code: 'UNSUPPORTED_MEDIA',
      message: 'SHA-256 requires byte-stream access.',
    });
  });

  it('rejects advertised or actual stream sizes beyond the allowed boundary', async () => {
    const handle = createMemoryHandle(new Uint8Array(5));
    await expect(
      hasher.hash(handle, { ...context, limits: { ...DEFAULT_LIMITS, maxBytes: 4 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const overrun: MediaHandle = {
      ...handle,
      async *stream() {
        yield new Uint8Array(6);
      },
    };
    await expect(hasher.hash(overrun, context)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const underrun: MediaHandle = {
      ...handle,
      async *stream() {
        yield new Uint8Array(4);
      },
    };
    await expect(hasher.hash(underrun, context)).rejects.toMatchObject({ code: 'IO_ERROR' });
  });

  it('honors cancellation and rejects non-progressing streams', async () => {
    const handle = createMemoryHandle(new Uint8Array(5));
    await expect(hasher.hash(handle, { ...context, cancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    const empty: MediaHandle = {
      ...handle,
      async *stream() {
        yield new Uint8Array();
      },
    };
    await expect(hasher.hash(empty, context)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('bounds chunk counts and individual chunks in addition to total bytes', async () => {
    const handle = createMemoryHandle(new Uint8Array(3));
    await expect(
      hasher.hash(handle, { ...context, limits: { ...DEFAULT_LIMITS, maxChunkBytes: 2 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const tinyChunks: MediaHandle = {
      ...handle,
      async *stream() {
        yield new Uint8Array(1);
        yield new Uint8Array(1);
        yield new Uint8Array(1);
      },
    };
    await expect(
      hasher.hash(tinyChunks, { ...context, limits: { ...DEFAULT_LIMITS, maxChunks: 2 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });
});

describe('foundation composition', () => {
  it('analyzes bounded stream-only media whose descriptor does not yet report a size', async () => {
    const complete = createMemoryHandle(Buffer.from('abc'));
    const media: Media = {
      descriptor: {
        kind: 'UNKNOWN',
        mimeType: 'application/octet-stream',
        source: { acquisition: 'OTHER' },
        metadataAvailability: 'NOT_PROBED',
        capabilities: ['STREAM'],
        limitations: ['Media format has not been probed.'],
      },
      handle: { sizeBytes: 3, stream: complete.stream },
    };
    const result = await analyze(media, createFoundationRegistry(nodeSha256Hasher));
    expect(result.evidence.find((item) => item.category === 'EXACT_IDENTITY')).toMatchObject({
      status: 'DETECTED',
      mediaHash: { value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
    });
    expect(result.conclusion).toMatchObject({ verdict: 'INCONCLUSIVE', origin: 'UNKNOWN' });
  });

  it('retains recorded metadata and reports hashing unavailable when stream access is absent', async () => {
    const complete = createMemoryHandle(
      readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url)),
    );
    const rangeOnly: MediaHandle = { sizeBytes: complete.sizeBytes, read: complete.read };
    const descriptor = await pngProbe.probe(rangeOnly, { acquisition: 'LOCAL_FILE' });
    for (const media of [
      { descriptor: { ...descriptor, capabilities: [] } },
      { descriptor, handle: rangeOnly },
    ]) {
      const result = await analyze(media, createFoundationRegistry(nodeSha256Hasher));
      expect(result.evidence.find((item) => item.category === 'METADATA')?.status).toBe('DETECTED');
      expect(result.evidence.find((item) => item.category === 'EXACT_IDENTITY')).toMatchObject({
        status: 'UNAVAILABLE',
      });
      expect(result.conclusion.verdict).toBe('INCONCLUSIVE');
      expect(result.evidence.some((item) => item.status === 'NOT_DETECTED')).toBe(false);
    }
  });

  it('produces deterministic recorded metadata and hashes, without an authenticity claim', async () => {
    const handle = createMemoryHandle(
      readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url)),
    );
    const media = {
      descriptor: await pngProbe.probe(handle, { acquisition: 'LOCAL_FILE' }),
      handle,
    };
    const first = await analyze(media, createFoundationRegistry(nodeSha256Hasher));
    const second = await analyze(media, createFoundationRegistry(webSha256Hasher));
    expect(first).toEqual(second);
    expect(first.conclusion).toMatchObject({
      verdict: 'INCONCLUSIVE',
      origin: 'UNKNOWN',
      modification: 'UNKNOWN',
      provenance: 'UNAVAILABLE',
      confidence: { kind: 'NOT_ASSESSED' },
    });
    expect(first.evidence.find((item) => item.category === 'METADATA')).toMatchObject({
      status: 'DETECTED',
      details: { kind: 'RECORDED' },
    });
    expect(
      first.evidence.find((item) => item.category === 'EXACT_IDENTITY')?.mediaHash?.value,
    ).toMatch(/^[a-f0-9]{64}$/);
    const deferred = first.evidence.filter((item) =>
      [
        'PROVENANCE',
        'WATERMARK',
        'AI_GENERATION',
        'MANIPULATION',
        'PERCEPTUAL_SIMILARITY',
      ].includes(item.category),
    );
    expect(deferred).toHaveLength(5);
    expect(deferred.every((item) => item.status === 'UNAVAILABLE')).toBe(true);
    expect(first.evidence.some((item) => item.status === 'NOT_DETECTED')).toBe(false);
  });
});
