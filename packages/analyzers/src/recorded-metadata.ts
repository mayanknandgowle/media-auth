import { createEvidence, unavailableResult, type Analyzer, type Evidence } from '@media-auth/core';
import type { MetadataAdapter } from './contracts.js';
import { compareExifDimensions } from './exif-dimensions.js';

/** Identical evidence semantics, with carrier-specific absence scope and limitations. */
export function createRecordedMetadataAnalyzer(
  adapter: MetadataAdapter,
  format: 'EXIF' | 'XMP',
  limitations: readonly string[],
  absenceExplanation: string,
): Analyzer {
  const identity = adapter.identity;
  const analyzer: Analyzer = {
    identity,
    category: 'METADATA',
    supportedMedia: ['IMAGE'],
    capabilities: ['LOCAL', 'NEEDS_BYTES'],
    async analyze(media, context) {
      const result = await adapter.read(media, context);
      if (result.status === 'UNAVAILABLE') return unavailableResult(analyzer, result.reason);
      const base = {
        schemaVersion: '1.0' as const,
        id: `${identity.id}:recorded`,
        source: identity,
        category: 'METADATA' as const,
        quality: {
          reliability: 'MEDIUM' as const,
          completeness: 'PARTIAL' as const,
          rationale:
            'Direct recorded metadata in a bounded subset; unvalidated fields and unverifiable claims remain.',
        },
      };
      let evidence: Evidence;
      if (result.status === 'DETECTED')
        evidence = createEvidence({
          ...base,
          status: 'DETECTED',
          confidence: { kind: 'NOT_ASSESSED' },
          explanation: `A supported ${format} block was observed; selected fields are recorded claims and do not verify origin or authenticity.`,
          details: {
            kind: 'RECORDED',
            observations: result.observations.map((item) => ({ ...item })),
            ...(format === 'EXIF'
              ? {
                  dimensionComparison: compareExifDimensions(
                    result.observations,
                    media.descriptor.dimensions,
                  ),
                }
              : {}),
          },
        });
      else if (result.status === 'NOT_DETECTED')
        evidence = createEvidence({
          ...base,
          status: 'NOT_DETECTED',
          scope: result.scope,
          explanation: absenceExplanation,
        });
      else
        evidence = createEvidence({
          ...base,
          status: 'INCONCLUSIVE',
          reason: result.reason,
          explanation: `${format} inspection could not produce an unambiguous supported observation.`,
        });
      return {
        schemaVersion: '1.0',
        analyzer: identity,
        status: result.status,
        evidence: [evidence],
        limitations:
          result.status === 'DETECTED'
            ? [
                ...result.limitations,
                ...(format === 'EXIF'
                  ? [
                      'EXIF dimension comparison is numeric only, on encoded axes without orientation. Differences may reflect legitimate JPEG padding or historical/forged metadata; neither agreement nor difference establishes a cause, origin or authenticity.',
                    ]
                  : []),
              ]
            : [...limitations, result.status === 'NOT_DETECTED' ? result.scope : result.reason],
      };
    },
  };
  return analyzer;
}
