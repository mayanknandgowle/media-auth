import {
  AnalyzerRegistry,
  createEvidence,
  unavailableResult,
  type Analyzer,
  type AnalyzerResult,
  type EvidenceCategory,
  type EvidenceSource,
  type Media,
  type AnalysisContext,
} from '@media-auth/core';
import type { ExactHasher, MetadataAdapter, MetadataReadResult } from './contracts.js';
import { jpegExifAnalyzer } from './jpeg-exif.js';
import { webpExifAnalyzer } from './webp-exif.js';
import { pngExifAnalyzer } from './png-exif.js';
export type * from './contracts.js';
export { jpegExifAdapter } from './jpeg-exif.js';
export { webpExifAdapter } from './webp-exif.js';
export { pngExifAdapter } from './png-exif.js';

const VERSION = '0.1.0';
const metadataIdentity: EvidenceSource = { id: 'media-auth.container-metadata', version: '0.5.0' };

/** Recorded encoded dimensions from supported container probes; no metadata payload parsing. */
export const containerMetadataAdapter: MetadataAdapter = {
  identity: metadataIdentity,
  async read(media: Media): Promise<MetadataReadResult> {
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'].includes(
        media.descriptor.mimeType,
      ) ||
      !media.descriptor.dimensions
    )
      return {
        status: 'UNAVAILABLE',
        reason: 'Only PNG, JPEG, WebP, GIF, and BMP container dimensions are recorded.',
      };
    return {
      status: 'DETECTED',
      observations: [
        {
          kind: 'RECORDED',
          format: 'CONTAINER',
          field: 'width',
          value: media.descriptor.dimensions.width,
        },
        {
          kind: 'RECORDED',
          format: 'CONTAINER',
          field: 'height',
          value: media.descriptor.dimensions.height,
        },
      ],
      limitations: [
        'Container observations do not establish capture device, creator, editing history, or authenticity.',
        'This dimensions adapter does not parse EXIF, XMP, IPTC, or ICC payloads; consult separate metadata evidence.',
        'Dimensions are encoded dimensions; metadata orientation is not applied.',
        ...(media.descriptor.mimeType === 'image/gif'
          ? ['GIF dimensions describe its logical screen; pixel aspect ratio is not applied.']
          : []),
      ],
    };
  },
};

const metadataAnalyzer: Analyzer = {
  identity: metadataIdentity,
  category: 'METADATA',
  supportedMedia: ['IMAGE'],
  capabilities: ['LOCAL'],
  async analyze(media, context) {
    const result = await containerMetadataAdapter.read(media, context);
    if (result.status !== 'DETECTED')
      return unavailableResult(
        metadataAnalyzer,
        'Only PNG, JPEG, WebP, GIF, and BMP container dimensions are recorded.',
      );
    return {
      schemaVersion: '1.0',
      analyzer: metadataIdentity,
      status: 'DETECTED',
      limitations: result.limitations,
      evidence: [
        createEvidence({
          schemaVersion: '1.0',
          id: 'media-auth.container-metadata:dimensions',
          source: metadataIdentity,
          category: 'METADATA',
          status: 'DETECTED',
          confidence: { kind: 'NOT_ASSESSED' },
          explanation: 'Recorded container dimensions were observed by the media probe.',
          quality: {
            reliability: 'HIGH',
            completeness: 'PARTIAL',
            rationale:
              'Direct container header observations; unrelated metadata and pixel data were not decoded.',
          },
          details: {
            kind: 'RECORDED',
            observations: result.observations.map((observation) => ({ ...observation })),
          },
        }),
      ],
    };
  },
};

function fingerprintAnalyzer(hasher: ExactHasher): Analyzer {
  const identity: EvidenceSource = { id: 'media-auth.exact-sha256', version: VERSION };
  const analyzer: Analyzer = {
    identity,
    category: 'EXACT_IDENTITY',
    supportedMedia: ['IMAGE', 'VIDEO', 'AUDIO', 'UNKNOWN'],
    capabilities: ['LOCAL', 'NEEDS_BYTES'],
    async analyze(media: Media, context: AnalysisContext): Promise<AnalyzerResult> {
      if (!media.handle || typeof media.handle.stream !== 'function')
        return unavailableResult(analyzer, 'Exact SHA-256 requires byte-stream access.');
      const hash = await hasher.hash(media.handle, context);
      return {
        schemaVersion: '1.0',
        analyzer: identity,
        status: 'DETECTED',
        limitations: [
          'Exact hashes identify bytes; they do not establish authenticity or perceptual similarity.',
        ],
        evidence: [
          createEvidence({
            schemaVersion: '1.0',
            id: 'media-auth.exact-sha256:identity',
            source: identity,
            category: 'EXACT_IDENTITY',
            status: 'DETECTED',
            confidence: { kind: 'NOT_ASSESSED' },
            mediaHash: hash,
            explanation: 'SHA-256 was computed over all acquired bytes with native cryptography.',
            quality: {
              reliability: 'HIGH',
              completeness: 'COMPLETE',
              rationale: 'All acquired bytes were included in the exact hash.',
            },
            details: { kind: 'EXACT', algorithm: hash.algorithm, value: hash.value },
          }),
        ],
      };
    },
  };
  return analyzer;
}

function deferredAnalyzer(id: string, category: EvidenceCategory, reason: string): Analyzer {
  const analyzer: Analyzer = {
    identity: { id, version: VERSION },
    category,
    supportedMedia: ['IMAGE', 'VIDEO', 'AUDIO', 'UNKNOWN'],
    capabilities: ['LOCAL'],
    async analyze() {
      return unavailableResult(analyzer, reason);
    },
  };
  return analyzer;
}

/** Explicit client composition: no singleton registry, remote requests, detector votes, or fabricated verification. */
export function createFoundationRegistry(hasher: ExactHasher): AnalyzerRegistry {
  return new AnalyzerRegistry([
    metadataAnalyzer,
    jpegExifAnalyzer,
    webpExifAnalyzer,
    pngExifAnalyzer,
    fingerprintAnalyzer(hasher),
    deferredAnalyzer(
      'media-auth.provenance',
      'PROVENANCE',
      'No provenance verifier is installed. Credentials were not inspected or verified; their absence is not established.',
    ),
    deferredAnalyzer('media-auth.watermark', 'WATERMARK', 'No watermark provider is installed.'),
    deferredAnalyzer(
      'media-auth.ai-generation',
      'AI_GENERATION',
      'No AI-generation detector is implemented.',
    ),
    deferredAnalyzer(
      'media-auth.manipulation',
      'MANIPULATION',
      'No manipulation detector is implemented.',
    ),
    deferredAnalyzer(
      'media-auth.perceptual-similarity',
      'PERCEPTUAL_SIMILARITY',
      'No perceptual fingerprint implementation is installed.',
    ),
  ]);
}
