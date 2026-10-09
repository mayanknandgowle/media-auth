/** Serializable domain vocabulary. No runtime, browser, filesystem, or UI dependencies. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type MediaKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'UNKNOWN';
export type AcquisitionMethod =
  'ORIGINAL_WEB_ASSET' | 'MEDIA_BLOB' | 'SCREEN_CAPTURE' | 'LOCAL_FILE' | 'OTHER';
export interface MediaSource {
  readonly acquisition: AcquisitionMethod;
  readonly label?: string;
}
export interface ContentHash {
  readonly algorithm: 'SHA-256';
  readonly value: string;
}
export type MetadataAvailability = 'PRESENT' | 'ABSENT' | 'UNAVAILABLE' | 'NOT_PROBED';
export interface MediaDescriptor {
  readonly kind: MediaKind;
  readonly mimeType: string;
  /** Omitted when size is not known; byte-backed foundation adapters require a known size. */
  readonly sizeBytes?: number;
  readonly source: MediaSource;
  readonly dimensions?: { readonly width: number; readonly height: number };
  readonly durationSeconds?: number;
  readonly contentHash?: ContentHash;
  /** Associated provider records; these do not confer trust or alter a conclusion by themselves. */
  readonly provenance?: readonly Provenance[];
  readonly metadataAvailability: MetadataAvailability;
  readonly capabilities: readonly ('RANGE_READ' | 'STREAM')[];
  readonly limitations: readonly string[];
}
/**
 * Adapters own lifetimes and advertise only available access methods.
 * Reads return exactly length bytes or reject; each stream invocation begins at zero.
 * Unknown-length/one-shot streams require a future bounded acquisition adapter.
 */
export interface MediaHandle {
  readonly sizeBytes: number;
  read?(offset: number, length: number): Promise<Uint8Array>;
  stream?(): AsyncIterable<Uint8Array>;
}
/** Concrete local-file and memory adapters provide both access methods. */
export interface CompleteMediaHandle extends MediaHandle {
  read(offset: number, length: number): Promise<Uint8Array>;
  stream(): AsyncIterable<Uint8Array>;
}
export interface Media {
  readonly descriptor: MediaDescriptor;
  readonly handle?: MediaHandle;
}
export interface ResourceLimits {
  readonly maxBytes: number;
  readonly maxPixels: number;
  readonly maxChunkBytes: number;
  readonly maxChunks: number;
}
export const DEFAULT_LIMITS: ResourceLimits = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  maxPixels: 40_000_000,
  maxChunkBytes: 8 * 1024 * 1024,
  maxChunks: 4096,
});
export interface MediaProbe {
  readonly id: string;
  probe(
    handle: MediaHandle,
    source: MediaSource,
    limits?: ResourceLimits,
  ): Promise<MediaDescriptor>;
}
export type EvidenceCategory =
  | 'METADATA'
  | 'PROVENANCE'
  | 'WATERMARK'
  | 'EXACT_IDENTITY'
  | 'PERCEPTUAL_SIMILARITY'
  | 'AI_GENERATION'
  | 'MANIPULATION'
  | 'CAPTURE'
  | 'CONTAINER';
export type EvidenceStatus = 'DETECTED' | 'NOT_DETECTED' | 'UNAVAILABLE' | 'INCONCLUSIVE';
export type AnalyzerStatus = EvidenceStatus;
export interface EvidenceSource {
  readonly id: string;
  readonly version: string;
}
export type Confidence =
  | { readonly kind: 'NOT_ASSESSED' }
  | { readonly kind: 'UNCALIBRATED'; readonly value: number }
  | { readonly kind: 'CALIBRATED'; readonly value: number; readonly calibrationId: string };
export interface EvidenceQuality {
  readonly reliability: 'UNASSESSED' | 'LOW' | 'MEDIUM' | 'HIGH';
  readonly completeness: 'UNKNOWN' | 'PARTIAL' | 'COMPLETE';
  readonly rationale: string;
}
interface EvidenceBase {
  readonly schemaVersion: '1.0';
  readonly id: string;
  readonly source: EvidenceSource;
  readonly category: EvidenceCategory;
  readonly explanation: string;
  readonly quality: EvidenceQuality;
  readonly mediaHash?: ContentHash;
  readonly spatial?: {
    readonly unit: 'NORMALIZED';
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly temporal?: { readonly startSeconds: number; readonly endSeconds: number };
}
export type Evidence = EvidenceBase &
  (
    | { readonly status: 'DETECTED'; readonly details: JsonValue; readonly confidence: Confidence }
    | { readonly status: 'NOT_DETECTED'; readonly scope: string; readonly details?: JsonValue }
    | { readonly status: 'UNAVAILABLE'; readonly reason: string }
    | { readonly status: 'INCONCLUSIVE'; readonly reason: string; readonly details?: JsonValue }
  );
export interface AnalyzerResult {
  readonly schemaVersion: '1.0';
  readonly analyzer: EvidenceSource;
  readonly status: AnalyzerStatus;
  readonly evidence: readonly Evidence[];
  readonly limitations: readonly string[];
}
export interface AnalysisContext {
  readonly limits: ResourceLimits;
  readonly cancelled: () => boolean;
}
export interface Analyzer {
  readonly identity: EvidenceSource;
  readonly category: EvidenceCategory;
  readonly supportedMedia: readonly MediaKind[];
  readonly capabilities: readonly ('LOCAL' | 'REMOTE_OPT_IN' | 'NEEDS_BYTES')[];
  analyze(media: Media, context: AnalysisContext): Promise<AnalyzerResult>;
}
export type Verdict =
  | 'LIKELY_AUTHENTIC'
  | 'LIKELY_AI_GENERATED'
  | 'LIKELY_MANIPULATED'
  | 'LIKELY_AI_GENERATED_AND_MANIPULATED'
  | 'INCONCLUSIVE'
  | 'UNKNOWN';
export type Origin = 'CAMERA_ORIGIN' | 'AI_GENERATED' | 'MIXED_ORIGIN' | 'UNKNOWN';
export type Modification =
  'NONE_DETECTED' | 'TRADITIONAL_EDITING' | 'AI_MANIPULATION' | 'MIXED_MANIPULATION' | 'UNKNOWN';
export type ProvenanceStatus = 'VERIFIED' | 'PARTIAL' | 'UNTRUSTED' | 'ABSENT' | 'UNAVAILABLE';
export interface Signer {
  readonly identity: string;
  readonly trust: 'TRUSTED' | 'UNTRUSTED' | 'UNKNOWN';
}
export interface Assertion {
  readonly type: string;
  readonly value: JsonValue;
}
export interface Claim {
  readonly id: string;
  readonly assertions: readonly Assertion[];
}
export interface Credential {
  readonly id: string;
  readonly system: string;
  readonly signer?: Signer;
  readonly claims: readonly Claim[];
}
export interface Transformation {
  readonly operation: string;
  readonly inputHash?: ContentHash;
  readonly outputHash?: ContentHash;
  readonly recordedAt?: string;
}
export type VerificationResult =
  | { readonly status: 'VERIFIED'; readonly trustPolicy: string }
  | {
      readonly status: 'PARTIAL' | 'UNTRUSTED' | 'ABSENT' | 'UNAVAILABLE';
      readonly reason: string;
    };
export interface Provenance {
  readonly system: string;
  readonly verification: VerificationResult;
  readonly credentials: readonly Credential[];
  readonly transformations: readonly Transformation[];
}
/** Values recorded in a file are observations, never proof of capture or origin. */
export interface CaptureMetadata {
  readonly kind: 'RECORDED';
  readonly cameraMake?: string;
  readonly cameraModel?: string;
  readonly capturedAt?: string;
}
export interface Conclusion {
  readonly verdict: Verdict;
  readonly origin: Origin;
  readonly modification: Modification;
  readonly provenance: ProvenanceStatus;
  readonly confidence: Confidence;
  readonly explanation: string;
  readonly evidenceIds: readonly string[];
}
export interface EvidenceFusion {
  readonly identity: EvidenceSource;
  fuse(evidence: readonly Evidence[]): Conclusion;
}
export interface AnalysisResult {
  readonly schemaVersion: '1.0';
  readonly media: MediaDescriptor;
  readonly analyzers: readonly AnalyzerResult[];
  readonly evidence: readonly Evidence[];
  readonly fusion: EvidenceSource;
  readonly conclusion: Conclusion;
  readonly limitations: readonly string[];
}
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_MEDIA'
  | 'RESOURCE_LIMIT'
  | 'IO_ERROR'
  | 'INVALID_ANALYZER'
  | 'CANCELLED';
export class MediaAuthError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MediaAuthError';
  }
}
