import { assertEvidence, assertJson, DEFAULT_LIMITS, type Evidence } from '@media-auth/core';
import { isRecord } from './protocol.js';
import { exifComparisonText } from './exif-comparison.js';

export interface ReportView {
  readonly verdict: string;
  readonly explanation: string;
  readonly facts: readonly [string, string][];
  readonly hash: string | undefined;
  readonly evidence: readonly Evidence[];
  readonly dimensionComparisons: ReadonlyMap<string, string>;
  readonly limitations: readonly string[];
  readonly json: string;
}

function invalid(): never {
  throw new Error('The analysis report is invalid or exceeds presentation limits.');
}
function text(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || !value.length || value.length > max) invalid();
  return value;
}
const verdicts = [
  'INCONCLUSIVE',
  'UNKNOWN',
  'LIKELY_AUTHENTIC',
  'LIKELY_AI_GENERATED',
  'LIKELY_MANIPULATED',
  'LIKELY_AI_GENERATED_AND_MANIPULATED',
];

/** Validate the displayed/exported boundary; rendering never interprets untrusted HTML. */
export function createReportView(value: unknown): ReportView {
  assertJson(value);
  if (
    !isRecord(value) ||
    value.schemaVersion !== '1.0' ||
    !isRecord(value.media) ||
    !isRecord(value.conclusion)
  )
    invalid();
  const media = value.media;
  const conclusion = value.conclusion;
  const mime = text(media.mimeType, 64);
  if (
    media.kind !== 'IMAGE' ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(mime)
  )
    invalid();
  if (
    typeof media.sizeBytes !== 'number' ||
    !Number.isSafeInteger(media.sizeBytes) ||
    media.sizeBytes < 1 ||
    media.sizeBytes > DEFAULT_LIMITS.maxBytes
  )
    invalid();
  const dimensions = media.dimensions;
  if (
    !isRecord(dimensions) ||
    typeof dimensions.width !== 'number' ||
    typeof dimensions.height !== 'number' ||
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > DEFAULT_LIMITS.maxPixels / dimensions.height
  )
    invalid();
  if (
    !isRecord(media.source) ||
    !['LOCAL_FILE', 'ORIGINAL_WEB_ASSET'].includes(text(media.source.acquisition, 32))
  )
    invalid();
  const verdict = text(conclusion.verdict, 64);
  if (!verdicts.includes(verdict)) invalid();
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length > 64 ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > 64
  )
    invalid();
  const evidence: Evidence[] = [];
  const dimensionComparisons = new Map<string, string>();
  const ids = new Set<string>();
  let hash: string | undefined;
  for (const item of value.evidence) {
    assertEvidence(item);
    if (ids.has(item.id)) invalid();
    ids.add(item.id);
    evidence.push(item);
    if (
      item.status === 'DETECTED' &&
      ['media-auth.jpeg-exif', 'media-auth.webp-exif', 'media-auth.png-exif'].includes(
        item.source.id,
      )
    ) {
      const comparison = exifComparisonText(item.details, {
        width: dimensions.width,
        height: dimensions.height,
      });
      if (comparison) dimensionComparisons.set(item.id, comparison);
    }
    if (item.category === 'EXACT_IDENTITY' && item.status === 'DETECTED') {
      if (
        !isRecord(item.details) ||
        item.details.kind !== 'EXACT' ||
        item.details.algorithm !== 'SHA-256' ||
        typeof item.details.value !== 'string' ||
        !/^[a-f0-9]{64}$/.test(item.details.value)
      )
        invalid();
      hash = item.details.value;
    }
  }
  if (
    !Array.isArray(conclusion.evidenceIds) ||
    conclusion.evidenceIds.length !== ids.size ||
    new Set(conclusion.evidenceIds).size !== ids.size ||
    !conclusion.evidenceIds.every((id: unknown) => typeof id === 'string' && ids.has(id))
  )
    invalid();
  const facts: [string, string][] = [
    ['Format', mime.replace('image/', '').toUpperCase()],
    ['Dimensions', `${dimensions.width} × ${dimensions.height} px`],
    ['File size', `${media.sizeBytes.toLocaleString('en-US')} bytes`],
    [
      'Acquired from',
      media.source.acquisition === 'LOCAL_FILE' ? 'Selected local file' : 'Selected page asset',
    ],
  ];
  if (media.source.label !== undefined) facts.push(['Filename', text(media.source.label, 160)]);
  return {
    verdict,
    explanation: text(conclusion.explanation),
    facts,
    hash,
    evidence,
    dimensionComparisons,
    limitations: value.limitations.map((item) => text(item)),
    json: JSON.stringify(value, null, 2),
  };
}

export const categoryLabels: Readonly<Record<string, string>> = {
  METADATA: 'Recorded metadata',
  EXACT_IDENTITY: 'Exact file identity',
  PROVENANCE: 'Provenance',
  WATERMARK: 'Watermarks',
  AI_GENERATION: 'AI generation',
  MANIPULATION: 'Manipulation',
  PERCEPTUAL_SIMILARITY: 'Perceptual similarity',
  CAPTURE: 'Capture context',
  CONTAINER: 'Container structure',
};
