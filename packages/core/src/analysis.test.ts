import { describe, expect, it, vi } from 'vitest';
import { AnalyzerRegistry, analyze, baselineFusion, validateLimits } from './analysis.js';
import { unavailableResult } from './evidence.js';
import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type Analyzer,
  type AnalyzerResult,
  type Evidence,
  type Media,
} from './domain.js';

const media: Media = {
  descriptor: {
    kind: 'IMAGE',
    mimeType: 'image/png',
    sizeBytes: 3,
    source: { acquisition: 'LOCAL_FILE' },
    metadataAvailability: 'NOT_PROBED',
    capabilities: ['RANGE_READ', 'STREAM'],
    limitations: [],
  },
  handle: {
    sizeBytes: 3,
    async read(_offset, length) {
      return new Uint8Array(length);
    },
    async *stream() {
      yield new Uint8Array(3);
    },
  },
};

function observation(id: string, evidenceId = `${id}:observation`): Evidence {
  return {
    schemaVersion: '1.0',
    id: evidenceId,
    source: { id, version: '1.0.0' },
    category: 'METADATA',
    status: 'DETECTED',
    confidence: { kind: 'NOT_ASSESSED' },
    details: { kind: 'RECORDED', field: 'container' },
    explanation: 'A container field was recorded.',
    quality: {
      reliability: 'HIGH',
      completeness: 'PARTIAL',
      rationale: 'Only the container field was inspected.',
    },
  };
}

function detectedResult(id: string, evidenceId?: string): AnalyzerResult {
  return {
    schemaVersion: '1.0',
    analyzer: { id, version: '1.0.0' },
    status: 'DETECTED',
    evidence: [observation(id, evidenceId)],
    limitations: ['No authenticity assessment.'],
  };
}

function makeAnalyzer(id = 'test.one', overrides: Partial<Analyzer> = {}): Analyzer {
  return {
    identity: { id, version: '1.0.0' },
    category: 'METADATA',
    supportedMedia: ['IMAGE'],
    capabilities: ['LOCAL'],
    async analyze() {
      return detectedResult(id);
    },
    ...overrides,
  };
}

describe('analyzer registry and execution', () => {
  it('preserves registration order, rejects duplicates, and bounds plugin count', () => {
    const registry = new AnalyzerRegistry([
      makeAnalyzer('test.second'),
      makeAnalyzer('test.first'),
    ]);
    expect(registry.list().map((item) => item.identity.id)).toEqual(['test.second', 'test.first']);
    expect(() => registry.register(makeAnalyzer('test.first'))).toThrow(
      expect.objectContaining({ code: 'INVALID_ANALYZER' }),
    );
    const full = new AnalyzerRegistry(
      Array.from({ length: 64 }, (_, i) => makeAnalyzer(`test.plugin-${i}`)),
    );
    expect(() => full.register(makeAnalyzer('test.overflow'))).toThrow(
      expect.objectContaining({ code: 'RESOURCE_LIMIT' }),
    );
  });

  it('snapshots plugin metadata so external mutation cannot bypass remote opt-in', async () => {
    const identity = { id: 'test.remote', version: '1.0.0' };
    const capabilities: ('LOCAL' | 'REMOTE_OPT_IN')[] = ['REMOTE_OPT_IN'];
    const run = vi.fn(async () => detectedResult('test.remote'));
    const registry = new AnalyzerRegistry([
      makeAnalyzer('test.remote', { identity, capabilities, analyze: run }),
    ]);
    identity.id = 'test.changed';
    capabilities.splice(0, 1, 'LOCAL');
    expect(registry.list()[0]?.identity.id).toBe('test.remote');
    const result = await analyze(media, registry);
    expect(run).not.toHaveBeenCalled();
    expect(result.analyzers[0]?.status).toBe('UNAVAILABLE');
  });

  it('reports unsupported media as unavailable without executing an incompatible analyzer', async () => {
    const run = vi.fn(async () => detectedResult('test.video'));
    const result = await analyze(
      media,
      new AnalyzerRegistry([
        makeAnalyzer('test.video', { supportedMedia: ['VIDEO'], analyze: run }),
      ]),
    );
    expect(run).not.toHaveBeenCalled();
    expect(result.analyzers[0]?.status).toBe('UNAVAILABLE');
    expect(result.conclusion).toMatchObject({ verdict: 'UNKNOWN', origin: 'UNKNOWN' });
  });

  it('runs remote analyzers only when the caller explicitly opts in', async () => {
    const run = vi.fn(async () => detectedResult('test.remote'));
    const registry = new AnalyzerRegistry([
      makeAnalyzer('test.remote', { capabilities: ['REMOTE_OPT_IN'], analyze: run }),
    ]);
    await analyze(media, registry);
    expect(run).not.toHaveBeenCalled();
    const allowed = await analyze(media, registry, { allowRemote: true });
    expect(run).toHaveBeenCalledOnce();
    expect(allowed.analyzers[0]?.status).toBe('DETECTED');
  });

  it('analyzes descriptor-only media and skips byte-dependent analyzers without claiming provenance trust', async () => {
    const run = vi.fn(async () => detectedResult('test.bytes'));
    const registry = new AnalyzerRegistry([
      makeAnalyzer(),
      makeAnalyzer('test.bytes', { capabilities: ['LOCAL', 'NEEDS_BYTES'], analyze: run }),
    ]);
    const descriptorOnly: Media = {
      descriptor: {
        kind: 'IMAGE',
        mimeType: 'image/png',
        source: { acquisition: 'OTHER' },
        metadataAvailability: 'NOT_PROBED',
        capabilities: [],
        limitations: ['Original bytes and size are unavailable.'],
        provenance: [
          {
            system: 'example.credentials',
            verification: { status: 'VERIFIED', trustPolicy: 'external-policy' },
            credentials: [],
            transformations: [],
          },
        ],
      },
    };
    const result = await analyze(descriptorOnly, registry);
    expect(run).not.toHaveBeenCalled();
    expect(result.analyzers.map((item) => item.status)).toEqual(['DETECTED', 'UNAVAILABLE']);
    expect(result.media.provenance).toEqual(descriptorOnly.descriptor.provenance);
    expect(result.media.sizeBytes).toBeUndefined();
    expect(result.conclusion).toMatchObject({
      verdict: 'INCONCLUSIVE',
      origin: 'UNKNOWN',
      provenance: 'UNAVAILABLE',
    });

    await analyze({ ...descriptorOnly, handle: { sizeBytes: 3 } }, registry);
    expect(run).not.toHaveBeenCalled();
  });

  it('isolates ordinary plugin failures and continues with explicit unavailable evidence', async () => {
    const failed = makeAnalyzer('test.failed', {
      async analyze() {
        throw new Error('Private implementation detail');
      },
    });
    const result = await analyze(media, new AnalyzerRegistry([failed, makeAnalyzer()]));
    expect(result.analyzers.map((item) => item.status)).toEqual(['UNAVAILABLE', 'DETECTED']);
    expect(result.conclusion.verdict).toBe('INCONCLUSIVE');
    expect(JSON.stringify(result)).not.toContain('Private implementation detail');
  });

  it('rejects invalid plugin results as unavailable rather than trusting their declarations', async () => {
    const result = await analyze(
      media,
      new AnalyzerRegistry([
        makeAnalyzer('test.invalid', {
          async analyze() {
            return detectedResult('test.wrong-identity');
          },
        }),
      ]),
    );
    expect(result.analyzers[0]).toMatchObject({ status: 'UNAVAILABLE' });
    expect(result.conclusion.verdict).toBe('UNKNOWN');
  });

  it('propagates resource-limit and cancellation errors instead of hiding a failed security boundary', async () => {
    for (const code of ['RESOURCE_LIMIT', 'CANCELLED'] as const) {
      const registry = new AnalyzerRegistry([
        makeAnalyzer('test.abort', {
          async analyze() {
            throw new MediaAuthError(code, 'Execution stopped.');
          },
        }),
      ]);
      await expect(analyze(media, registry)).rejects.toMatchObject({ code });
    }
  });

  it('checks cancellation before execution and after the final analyzer', async () => {
    const run = vi.fn(async () => detectedResult('test.cancel'));
    const registry = new AnalyzerRegistry([makeAnalyzer('test.cancel', { analyze: run })]);
    await expect(analyze(media, registry, { cancelled: () => true })).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    expect(run).not.toHaveBeenCalled();
    let cancelled = false;
    const cancels = makeAnalyzer('test.cancel', {
      async analyze() {
        cancelled = true;
        return detectedResult('test.cancel');
      },
    });
    await expect(
      analyze(media, new AnalyzerRegistry([cancels]), { cancelled: () => cancelled }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('keeps evidence IDs unique even when a plugin preempts another fallback ID', async () => {
    const first = makeAnalyzer('test.first', {
      async analyze() {
        return detectedResult('test.first', 'test.second:unavailable');
      },
    });
    const second = makeAnalyzer('test.second', {
      async analyze() {
        return detectedResult('test.second', 'test.second:unavailable');
      },
    });
    const result = await analyze(media, new AnalyzerRegistry([first, second]));
    expect(result.analyzers.map((item) => item.status)).toEqual(['DETECTED', 'UNAVAILABLE']);
    expect(result.evidence.map((item) => item.id)).toEqual([
      'test.second:unavailable',
      'test.second:unavailable:1',
    ]);
    expect(new Set(result.conclusion.evidenceIds).size).toBe(result.evidence.length);
  });

  it('is deterministic and does not infer authenticity from absence or unavailable detectors', async () => {
    const absent = makeAnalyzer('test.absent', {
      async analyze() {
        return {
          schemaVersion: '1.0',
          analyzer: { id: 'test.absent', version: '1.0.0' },
          status: 'NOT_DETECTED',
          limitations: [],
          evidence: [
            {
              schemaVersion: '1.0',
              id: 'test.absent:metadata',
              source: { id: 'test.absent', version: '1.0.0' },
              category: 'METADATA',
              status: 'NOT_DETECTED',
              scope: 'One supported metadata location only.',
              explanation: 'No field in that location.',
              quality: {
                reliability: 'HIGH',
                completeness: 'PARTIAL',
                rationale: 'Only one location was inspected.',
              },
            },
          ],
        };
      },
    });
    const unavailable = makeAnalyzer('test.unavailable');
    const registry = new AnalyzerRegistry([
      absent,
      {
        ...unavailable,
        async analyze() {
          return unavailableResult(unavailable, 'Not installed.');
        },
      },
    ]);
    const result = await analyze(media, registry);
    expect(await analyze(media, registry)).toEqual(result);
    expect(result.conclusion).toMatchObject({
      verdict: 'INCONCLUSIVE',
      origin: 'UNKNOWN',
      modification: 'UNKNOWN',
      provenance: 'UNAVAILABLE',
      confidence: { kind: 'NOT_ASSESSED' },
    });
    expect(baselineFusion.fuse([]).verdict).toBe('UNKNOWN');
  });

  it('bounds input size and requires descriptor/handle agreement before running plugins', async () => {
    const run = vi.fn(async () => detectedResult('test.sizes'));
    const registry = new AnalyzerRegistry([makeAnalyzer('test.sizes', { analyze: run })]);
    await expect(
      analyze(media, registry, { limits: { ...DEFAULT_LIMITS, maxBytes: 2 } }),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    await expect(
      analyze({ ...media, descriptor: { ...media.descriptor, sizeBytes: 2 } }, registry),
    ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    for (const sizeBytes of [-1, Number.NaN, 1.5, DEFAULT_LIMITS.maxBytes + 1]) {
      await expect(
        analyze({ descriptor: { ...media.descriptor, sizeBytes } }, registry),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
      await expect(analyze({ ...media, handle: { sizeBytes } }, registry)).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT',
      });
    }
    expect(run).not.toHaveBeenCalled();
    for (const maxChunkBytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      expect(() => validateLimits({ ...DEFAULT_LIMITS, maxChunkBytes })).toThrow(
        expect.objectContaining({ code: 'RESOURCE_LIMIT' }),
      );
    }
  });

  it('enforces pixel limits for callers that provide their own probed descriptor', async () => {
    const run = vi.fn(async () => detectedResult('test.dimensions'));
    const registry = new AnalyzerRegistry([makeAnalyzer('test.dimensions', { analyze: run })]);
    for (const dimensions of [
      { width: 100_000, height: 100_000 },
      { width: 0, height: 1 },
      { width: 1.5, height: 1 },
      { width: 1, height: Number.POSITIVE_INFINITY },
    ]) {
      await expect(
        analyze({ ...media, descriptor: { ...media.descriptor, dimensions } }, registry),
      ).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    }
    expect(run).not.toHaveBeenCalled();
  });
});
