import { DEFAULT_LIMITS, MediaAuthError } from './domain.js';
import type {
  AnalysisContext,
  AnalysisResult,
  Analyzer,
  AnalyzerResult,
  EvidenceFusion,
  Media,
  ResourceLimits,
} from './domain.js';
import { assertAnalyzer, unavailableResult, validateAnalyzerResult } from './evidence.js';

/** Registration order is execution order; no global registry or implicit plugin discovery. */
export class AnalyzerRegistry {
  private readonly entries = new Map<string, Analyzer>();
  constructor(analyzers: readonly Analyzer[] = []) {
    for (const analyzer of analyzers) this.register(analyzer);
  }
  register(analyzer: Analyzer): this {
    assertAnalyzer(analyzer);
    if (this.entries.has(analyzer.identity.id))
      throw new MediaAuthError('INVALID_ANALYZER', 'Analyzer identity is already registered.');
    if (this.entries.size >= 64) throw new MediaAuthError('RESOURCE_LIMIT', 'Too many analyzers.');
    this.entries.set(
      analyzer.identity.id,
      Object.freeze({
        identity: Object.freeze({ ...analyzer.identity }),
        category: analyzer.category,
        supportedMedia: Object.freeze([...analyzer.supportedMedia]),
        capabilities: Object.freeze([...analyzer.capabilities]),
        analyze: analyzer.analyze.bind(analyzer),
      }),
    );
    return this;
  }
  list(): readonly Analyzer[] {
    return [...this.entries.values()];
  }
}

/** No authenticity policy has been validated. Absence and failure never imply authenticity. */
export const baselineFusion: EvidenceFusion = {
  identity: { id: 'mediaauth.baseline', version: '0.1.0' },
  fuse(evidence) {
    const observed = evidence.some((item) => item.status !== 'UNAVAILABLE');
    return {
      verdict: observed ? 'INCONCLUSIVE' : 'UNKNOWN',
      origin: 'UNKNOWN',
      modification: 'UNKNOWN',
      provenance: 'UNAVAILABLE',
      confidence: { kind: 'NOT_ASSESSED' },
      evidenceIds: evidence.map((item) => item.id),
      explanation: observed
        ? 'Evidence is available, but the baseline has no validated rule for inferring authenticity, origin, modification, or provenance trust.'
        : 'No usable evidence was obtained. Unavailable analysis does not support an authenticity conclusion.',
    };
  },
};

export interface AnalysisOptions {
  readonly limits?: ResourceLimits;
  readonly cancelled?: () => boolean;
  readonly fusion?: EvidenceFusion;
  /** Clients must obtain explicit, informed consent before enabling remote analyzers. */
  readonly allowRemote?: boolean;
}

export function validateLimits(limits: ResourceLimits): void {
  for (const value of [limits.maxBytes, limits.maxPixels, limits.maxChunkBytes, limits.maxChunks])
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new MediaAuthError('RESOURCE_LIMIT', 'Resource limits must be positive safe integers.');
}

export async function analyze(
  media: Media,
  registry: AnalyzerRegistry,
  options: AnalysisOptions = {},
): Promise<AnalysisResult> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  validateLimits(limits);
  const descriptorSize = media.descriptor.sizeBytes;
  const handleSize = media.handle?.sizeBytes;
  const invalidSize = (size: number): boolean =>
    !Number.isSafeInteger(size) || size < 0 || size > limits.maxBytes;
  if (
    (descriptorSize !== undefined && invalidSize(descriptorSize)) ||
    (media.handle && (handleSize === undefined || invalidSize(handleSize))) ||
    (descriptorSize !== undefined && handleSize !== undefined && descriptorSize !== handleSize)
  )
    throw new MediaAuthError(
      'RESOURCE_LIMIT',
      'Input size is invalid or exceeds the analysis limit.',
    );
  const dimensions = media.descriptor.dimensions;
  if (
    dimensions &&
    (!Number.isSafeInteger(dimensions.width) ||
      !Number.isSafeInteger(dimensions.height) ||
      dimensions.width <= 0 ||
      dimensions.height <= 0 ||
      dimensions.width > Math.floor(limits.maxPixels / dimensions.height))
  ) {
    throw new MediaAuthError(
      'RESOURCE_LIMIT',
      'Media dimensions are invalid or exceed the pixel limit.',
    );
  }
  const context: AnalysisContext = { limits, cancelled: options.cancelled ?? (() => false) };
  const analyzers: AnalyzerResult[] = [];
  const ids = new Set<string>();
  for (const analyzer of registry.list()) {
    if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Analysis cancelled.');
    let result: AnalyzerResult;
    if (!analyzer.supportedMedia.includes(media.descriptor.kind))
      result = unavailableResult(analyzer, 'Media type is unsupported by this analyzer.');
    else if (analyzer.capabilities.includes('REMOTE_OPT_IN') && !options.allowRemote)
      result = unavailableResult(analyzer, 'Remote analysis requires explicit opt-in.');
    else if (
      analyzer.capabilities.includes('NEEDS_BYTES') &&
      typeof media.handle?.read !== 'function' &&
      typeof media.handle?.stream !== 'function'
    )
      result = unavailableResult(analyzer, 'Media bytes are unavailable to this analyzer.');
    else {
      try {
        result = validateAnalyzerResult(await analyzer.analyze(media, context), analyzer);
      } catch (error) {
        if (
          error instanceof MediaAuthError &&
          (error.code === 'CANCELLED' || error.code === 'RESOURCE_LIMIT')
        )
          throw error;
        result = unavailableResult(
          analyzer,
          error instanceof MediaAuthError && error.code === 'INVALID_ANALYZER'
            ? 'Analyzer output failed contract validation.'
            : 'Analyzer failed; evidence could not be obtained.',
        );
      }
    }
    if (result.evidence.some((item) => ids.has(item.id))) {
      const baseId = `${analyzer.identity.id}:unavailable`;
      let uniqueId = baseId;
      let suffix = 0;
      while (ids.has(uniqueId)) uniqueId = `${baseId}:${++suffix}`;
      result = unavailableResult(
        analyzer,
        'Analyzer returned an evidence ID already used by another analyzer.',
        uniqueId,
      );
    }
    for (const item of result.evidence) ids.add(item.id);
    analyzers.push(result);
  }
  if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Analysis cancelled.');
  const evidence = analyzers.flatMap((item) => item.evidence);
  const fusion = options.fusion ?? baselineFusion;
  return {
    schemaVersion: '1.0',
    media: media.descriptor,
    analyzers,
    evidence,
    fusion: { ...fusion.identity },
    conclusion: fusion.fuse(evidence),
    limitations: [
      ...new Set([
        ...media.descriptor.limitations,
        ...analyzers.flatMap((item) => item.limitations),
      ]),
    ],
  };
}
