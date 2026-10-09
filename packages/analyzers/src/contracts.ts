import type {
  AnalysisContext,
  ContentHash,
  EvidenceSource,
  JsonValue,
  Media,
  MediaHandle,
  MediaKind,
  Provenance,
} from '@media-auth/core';

/** Exact byte identity only: equal hashes do not establish source or authenticity. */
export interface ExactHasher {
  hash(handle: MediaHandle, context: AnalysisContext): Promise<ContentHash>;
}

export interface MetadataObservation {
  readonly kind: 'RECORDED';
  readonly format: 'CONTAINER' | 'EXIF' | 'XMP' | 'IPTC' | 'ICC';
  readonly field: string;
  readonly value: JsonValue;
}

export type MetadataReadResult =
  | {
      readonly status: 'DETECTED';
      readonly observations: readonly MetadataObservation[];
      readonly limitations: readonly string[];
    }
  | { readonly status: 'NOT_DETECTED'; readonly scope: string }
  | { readonly status: 'UNAVAILABLE' | 'INCONCLUSIVE'; readonly reason: string };

/** Metadata remains a recorded observation, even when a field names a camera or editor. */
export interface MetadataAdapter {
  readonly identity: EvidenceSource;
  read(media: Media, context: AnalysisContext): Promise<MetadataReadResult>;
}

/** Implementations must state their verification/trust policy; missing integration is UNAVAILABLE. */
export interface ProvenanceAdapter {
  readonly identity: EvidenceSource;
  verify(media: Media, context: AnalysisContext): Promise<Provenance>;
}

/** Similarity is a separate namespace and contract from exact SHA-256 byte identity. */
export interface PerceptualFingerprint {
  readonly kind: 'PERCEPTUAL';
  readonly algorithm: EvidenceSource;
  readonly mediaKind: MediaKind;
  readonly representation:
    | { readonly encoding: 'HEX'; readonly value: string }
    | { readonly encoding: 'VECTOR'; readonly values: readonly number[] };
}

export type PerceptualFingerprintResult =
  | { readonly status: 'DETECTED'; readonly fingerprint: PerceptualFingerprint }
  | { readonly status: 'UNAVAILABLE' | 'INCONCLUSIVE'; readonly reason: string };

export interface PerceptualFingerprintAdapter {
  readonly identity: EvidenceSource;
  compute(media: Media, context: AnalysisContext): Promise<PerceptualFingerprintResult>;
}
