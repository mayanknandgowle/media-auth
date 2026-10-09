import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  assertAnalyzer,
  assertEvidence,
  assertJson,
  createEvidence,
  validateAnalyzerResult,
} from './evidence.js';
import { baselineFusion } from './analysis.js';
import type {
  Analyzer,
  AnalyzerResult,
  Confidence,
  Evidence,
  Provenance,
  VerificationResult,
} from './domain.js';

const base = {
  schemaVersion: '1.0' as const,
  id: 'test.metadata:observation',
  source: { id: 'test.metadata', version: '1.0.0' },
  category: 'METADATA' as const,
  explanation: 'A recorded field was observed, without inferring capture origin.',
  quality: {
    reliability: 'LOW' as const,
    completeness: 'PARTIAL' as const,
    rationale: 'A recorded field can be forged.',
  },
};
const detected: Evidence = {
  ...base,
  status: 'DETECTED',
  confidence: { kind: 'UNCALIBRATED', value: 0.97 },
  details: { camera: 'Recorded camera name' },
};
const analyzer: Analyzer = {
  identity: base.source,
  category: 'METADATA',
  supportedMedia: ['IMAGE'],
  capabilities: ['LOCAL'],
  async analyze() {
    return {
      schemaVersion: '1.0',
      analyzer: base.source,
      status: 'DETECTED',
      evidence: [detected],
      limitations: [],
    };
  },
};

describe('evidence contracts', () => {
  it('preserves detection, scoped absence, unavailability, and inconclusive observations separately', () => {
    const evidence: Evidence[] = [
      detected,
      { ...base, status: 'NOT_DETECTED', scope: 'Only the supported header field was inspected.' },
      { ...base, status: 'UNAVAILABLE', reason: 'No adapter is installed.' },
      {
        ...base,
        status: 'INCONCLUSIVE',
        reason: 'The observation does not resolve this question.',
      },
    ];
    expect(evidence.map((item) => createEvidence(item).status)).toEqual([
      'DETECTED',
      'NOT_DETECTED',
      'UNAVAILABLE',
      'INCONCLUSIVE',
    ]);
    expect(baselineFusion.fuse([evidence[2] ?? detected]).verdict).toBe('UNKNOWN');
    expect(baselineFusion.fuse([evidence[1] ?? detected]).verdict).toBe('INCONCLUSIVE');
  });

  it('keeps detector confidence separate from evidence quality and conclusion confidence', () => {
    const copy = createEvidence(detected);
    expect(copy).toMatchObject({ confidence: { value: 0.97 }, quality: { reliability: 'LOW' } });
    expect(baselineFusion.fuse([copy])).toMatchObject({
      verdict: 'INCONCLUSIVE',
      origin: 'UNKNOWN',
      confidence: { kind: 'NOT_ASSESSED' },
    });
  });

  it('copies nested observations instead of retaining a plugin-owned object', () => {
    const details = { recorded: { camera: 'Before' } };
    const copy = createEvidence({ ...detected, details });
    details.recorded.camera = 'After';
    expect(copy).toMatchObject({ details: { recorded: { camera: 'Before' } } });
  });

  it.each([
    { ...detected, status: true },
    { ...base, status: 'NOT_DETECTED' },
    { ...base, status: 'UNAVAILABLE' },
    { ...base, status: 'INCONCLUSIVE' },
    {
      ...base,
      status: 'UNAVAILABLE',
      reason: 'Unsupported',
      confidence: { kind: 'UNCALIBRATED', value: 0 },
    },
    { ...detected, confidence: { kind: 'UNCALIBRATED', value: -0.1 } },
    { ...detected, confidence: { kind: 'UNCALIBRATED', value: 1.1 } },
    { ...detected, confidence: { kind: 'CALIBRATED', value: 0.9 } },
    { ...detected, confidence: { kind: 'UNCALIBRATED', value: Number.NaN } },
    { ...detected, mediaHash: { algorithm: 'SHA-256', value: 'not-a-hash' } },
    { ...detected, spatial: { unit: 'NORMALIZED', x: 0.9, y: 0, width: 0.5, height: 1 } },
    { ...detected, temporal: { startSeconds: 2, endSeconds: 1 } },
    { ...detected, temporal: { startSeconds: 0, endSeconds: Number.POSITIVE_INFINITY } },
  ])('rejects malformed status, confidence, or location data %#', (value) => {
    expect(() => assertEvidence(value)).toThrow(
      expect.objectContaining({ code: 'INVALID_ANALYZER' }),
    );
  });

  it('requires a calibration reference before confidence can be described as calibrated', () => {
    const confidence: Confidence = {
      kind: 'CALIBRATED',
      value: 0.9,
      calibrationId: 'benchmark-v1',
    };
    expect(createEvidence({ ...detected, confidence })).toMatchObject({ confidence });
    expectTypeOf<{ kind: 'CALIBRATED'; value: number }>().not.toExtend<Confidence>();
  });

  it('rejects non-JSON, cyclic, or resource-exhausting plugin details', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const values: unknown[] = [
      cycle,
      new Date(),
      undefined,
      () => 'unexpected',
      BigInt(1),
      Number.NaN,
      'x'.repeat(65537),
      Array.from({ length: 1025 }, () => null),
    ];
    for (const value of values) expect(() => assertJson(value)).toThrow();
  });

  it('preserves explicit provenance absence without turning it into verification or authenticity', () => {
    const absent: Provenance = {
      system: 'test.credentials',
      verification: {
        status: 'ABSENT',
        reason: 'No credential in the inspected supported location.',
      },
      credentials: [],
      transformations: [],
    };
    const unavailable: Provenance = {
      ...absent,
      verification: { status: 'UNAVAILABLE', reason: 'No verifier is installed.' },
    };
    expect(absent.verification.status).not.toEqual(unavailable.verification.status);
    expectTypeOf<{ status: 'VERIFIED'; reason: string }>().not.toExtend<VerificationResult>();
    expectTypeOf<{ status: 'VERIFIED'; trustPolicy: string }>().toExtend<VerificationResult>();
  });
});

describe('analyzer result validation', () => {
  it('detaches limitations and evidence from plugin-owned collections', () => {
    const limitations = ['Only one field was inspected.'];
    const original: AnalyzerResult = {
      schemaVersion: '1.0',
      analyzer: base.source,
      status: 'DETECTED',
      evidence: [detected],
      limitations,
    };
    const validated = validateAnalyzerResult(original, analyzer);
    limitations[0] = 'Changed after validation.';
    expect(validated.limitations).toEqual(['Only one field was inspected.']);
  });

  it('requires result identity, evidence source, category, and result status to agree', () => {
    const result: AnalyzerResult = {
      schemaVersion: '1.0',
      analyzer: base.source,
      status: 'DETECTED',
      evidence: [detected],
      limitations: [],
    };
    const invalid: unknown[] = [
      { ...result, analyzer: { id: 'another.analyzer', version: '1.0.0' } },
      { ...result, evidence: [{ ...detected, source: { ...base.source, version: '2.0.0' } }] },
      { ...result, evidence: [{ ...detected, category: 'AI_GENERATION' }] },
      { ...result, evidence: [detected, detected] },
      { ...result, evidence: [] },
      { ...result, status: 'NOT_DETECTED' },
      { ...result, status: 'UNAVAILABLE' },
      { ...result, limitations: [42] },
    ];
    for (const value of invalid) expect(() => validateAnalyzerResult(value, analyzer)).toThrow();
  });

  it('rejects malformed analyzer metadata before execution', () => {
    for (const descriptor of [
      { ...analyzer, identity: { ...base.source, id: 'Invalid identity!' } },
      { ...analyzer, supportedMedia: ['DOCUMENT'] },
      { ...analyzer, capabilities: ['REMOTE_UNDISCLOSED'] },
      { ...analyzer, analyze: null },
    ])
      expect(() => assertAnalyzer(descriptor)).toThrow(
        expect.objectContaining({ code: 'INVALID_ANALYZER' }),
      );
  });
});
