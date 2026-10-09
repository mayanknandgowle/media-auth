import { MediaAuthError } from './domain.js';
import type { Analyzer, AnalyzerResult, Evidence, EvidenceSource, JsonValue } from './domain.js';

const categories = [
  'METADATA',
  'PROVENANCE',
  'WATERMARK',
  'EXACT_IDENTITY',
  'PERCEPTUAL_SIMILARITY',
  'AI_GENERATION',
  'MANIPULATION',
  'CAPTURE',
  'CONTAINER',
];
const statuses = ['DETECTED', 'NOT_DETECTED', 'UNAVAILABLE', 'INCONCLUSIVE'];
function invalid(): never {
  throw new MediaAuthError('INVALID_ANALYZER', 'Analyzer returned invalid or excessive evidence.');
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096;
}
function oneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === 'string' && choices.includes(value);
}
function unit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function source(value: unknown): value is EvidenceSource {
  return record(value) && text(value.id) && text(value.version);
}

/** Validate plugin metadata before it participates in execution or consent decisions. */
export function assertAnalyzer(value: unknown): asserts value is Analyzer {
  if (
    !record(value) ||
    !source(value.identity) ||
    !/^[a-z][a-z0-9.-]{0,127}$/.test(value.identity.id) ||
    value.identity.version.length > 128 ||
    !oneOf(value.category, categories) ||
    !Array.isArray(value.supportedMedia) ||
    value.supportedMedia.length === 0 ||
    value.supportedMedia.length > 4 ||
    !value.supportedMedia.every((kind: unknown) =>
      oneOf(kind, ['IMAGE', 'VIDEO', 'AUDIO', 'UNKNOWN']),
    ) ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length > 3 ||
    !value.capabilities.every((capability: unknown) =>
      oneOf(capability, ['LOCAL', 'REMOTE_OPT_IN', 'NEEDS_BYTES']),
    ) ||
    typeof value.analyze !== 'function'
  ) {
    throw new MediaAuthError('INVALID_ANALYZER', 'Analyzer descriptor is invalid.');
  }
}

/** Bound depth, node count and text before serialization; cycles fail the depth budget. */
export function assertJson(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  let characters = 0;
  function walk(item: unknown, depth: number): void {
    if (++nodes > 8192 || depth > 16) invalid();
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) invalid();
      return;
    }
    if (typeof item === 'string') {
      characters += item.length;
      if (characters > 65536) invalid();
      return;
    }
    if (Array.isArray(item)) {
      if (item.length > 1024) invalid();
      for (const child of item) walk(child, depth + 1);
      return;
    }
    if (!record(item) || ![Object.prototype, null].includes(Object.getPrototypeOf(item))) invalid();
    const entries = Object.entries(item);
    if (entries.length > 128) invalid();
    for (const [key, child] of entries) {
      characters += key.length;
      if (characters > 65536) invalid();
      walk(child, depth + 1);
    }
  }
  walk(value, 0);
}

export function assertEvidence(value: unknown): asserts value is Evidence {
  assertJson(value);
  if (
    !record(value) ||
    value.schemaVersion !== '1.0' ||
    !text(value.id) ||
    !source(value.source) ||
    !oneOf(value.category, categories) ||
    !text(value.explanation) ||
    !oneOf(value.status, statuses)
  )
    invalid();
  const quality = value.quality;
  if (
    !record(quality) ||
    !oneOf(quality.reliability, ['UNASSESSED', 'LOW', 'MEDIUM', 'HIGH']) ||
    !oneOf(quality.completeness, ['UNKNOWN', 'PARTIAL', 'COMPLETE']) ||
    !text(quality.rationale)
  )
    invalid();
  if (value.status === 'DETECTED') {
    const confidence = value.confidence;
    if (
      !('details' in value) ||
      !record(confidence) ||
      !oneOf(confidence.kind, ['NOT_ASSESSED', 'UNCALIBRATED', 'CALIBRATED'])
    )
      invalid();
    if (confidence.kind !== 'NOT_ASSESSED' && !unit(confidence.value)) invalid();
    if (confidence.kind === 'CALIBRATED' && !text(confidence.calibrationId)) invalid();
  } else {
    if ('confidence' in value) invalid();
    if (value.status === 'NOT_DETECTED' ? !text(value.scope) : !text(value.reason)) invalid();
  }
  if (
    value.mediaHash !== undefined &&
    (!record(value.mediaHash) ||
      value.mediaHash.algorithm !== 'SHA-256' ||
      typeof value.mediaHash.value !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.mediaHash.value))
  )
    invalid();
  if (value.spatial !== undefined) {
    const s = value.spatial;
    if (
      !record(s) ||
      s.unit !== 'NORMALIZED' ||
      !unit(s.x) ||
      !unit(s.y) ||
      !unit(s.width) ||
      !unit(s.height) ||
      s.x + s.width > 1 ||
      s.y + s.height > 1
    )
      invalid();
  }
  if (value.temporal !== undefined) {
    const t = value.temporal;
    if (
      !record(t) ||
      typeof t.startSeconds !== 'number' ||
      typeof t.endSeconds !== 'number' ||
      t.startSeconds < 0 ||
      t.endSeconds < t.startSeconds
    )
      invalid();
  }
}

/** Copies observations so plugins cannot mutate previously accepted results. */
export function createEvidence(evidence: Evidence): Evidence {
  assertEvidence(evidence);
  const copy: unknown = JSON.parse(JSON.stringify(evidence));
  assertEvidence(copy);
  return copy;
}

export function unavailableResult(
  analyzer: Analyzer,
  reason: string,
  evidenceId = `${analyzer.identity.id}:unavailable`,
): AnalyzerResult {
  return {
    schemaVersion: '1.0',
    analyzer: { ...analyzer.identity },
    status: 'UNAVAILABLE',
    evidence: [
      createEvidence({
        schemaVersion: '1.0',
        id: evidenceId,
        source: { ...analyzer.identity },
        category: analyzer.category,
        status: 'UNAVAILABLE',
        reason,
        explanation: reason,
        quality: {
          reliability: 'UNASSESSED',
          completeness: 'UNKNOWN',
          rationale: 'No observation was obtained.',
        },
      }),
    ],
    limitations: [reason],
  };
}

export function validateAnalyzerResult(value: unknown, analyzer: Analyzer): AnalyzerResult {
  assertJson(value);
  if (
    !record(value) ||
    value.schemaVersion !== '1.0' ||
    !source(value.analyzer) ||
    value.analyzer.id !== analyzer.identity.id ||
    value.analyzer.version !== analyzer.identity.version ||
    !oneOf(value.status, statuses) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    value.evidence.length > 128 ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > 32 ||
    !value.limitations.every(text)
  )
    invalid();
  const evidence = value.evidence.map((item: unknown) => {
    assertEvidence(item);
    if (
      item.source.id !== analyzer.identity.id ||
      item.source.version !== analyzer.identity.version ||
      item.category !== analyzer.category
    )
      invalid();
    return createEvidence(item);
  });
  if (new Set(evidence.map((item) => item.id)).size !== evidence.length) invalid();
  if (value.status === 'UNAVAILABLE' && evidence.some((item) => item.status !== 'UNAVAILABLE'))
    invalid();
  if (value.status === 'DETECTED' && !evidence.some((item) => item.status === 'DETECTED'))
    invalid();
  if (value.status === 'NOT_DETECTED' && evidence.some((item) => item.status !== 'NOT_DETECTED'))
    invalid();
  // Build from validated primitives; the status guard is explicit for TypeScript too.
  const status = value.status;
  if (
    status !== 'DETECTED' &&
    status !== 'NOT_DETECTED' &&
    status !== 'UNAVAILABLE' &&
    status !== 'INCONCLUSIVE'
  )
    invalid();
  return {
    schemaVersion: '1.0',
    analyzer: { ...analyzer.identity },
    status,
    evidence,
    limitations: [...value.limitations],
  };
}
