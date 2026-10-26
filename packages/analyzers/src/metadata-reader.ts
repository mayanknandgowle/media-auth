import { MediaAuthError, validateLimits, type AnalysisContext, type Media } from '@media-auth/core';
import type { MetadataReadResult } from './contracts.js';

export interface MetadataReader {
  readonly sizeBytes: number;
  range(offset: number, length: number): Promise<Uint8Array>;
  consume(): void;
}
type Unreadable = Extract<MetadataReadResult, { status: 'UNAVAILABLE' | 'INCONCLUSIVE' }>;

export function invalidMetadata(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

/** Common direct-call boundary; carrier/format labels preserve scoped diagnostics. */
export function openMetadataReader(
  media: Media,
  context: AnalysisContext,
  mimeType: 'image/jpeg' | 'image/webp' | 'image/png',
  label: string,
  format: 'EXIF' | 'XMP',
): MetadataReader | Unreadable {
  validateLimits(context.limits);
  if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
  if (media.descriptor.mimeType !== mimeType)
    return {
      status: 'UNAVAILABLE',
      reason: `This ${format} reader supports ${label} only; other metadata has not been searched.`,
    };
  const handle = media.handle;
  if (!handle || typeof handle.read !== 'function')
    return {
      status: 'UNAVAILABLE',
      reason: `${label} ${format} inspection requires byte-range access.`,
    };
  const sizeBytes = handle.sizeBytes;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0)
    return { status: 'INCONCLUSIVE', reason: `${label} byte size is invalid.` };
  if (sizeBytes > context.limits.maxBytes)
    throw new MediaAuthError('RESOURCE_LIMIT', `${label} exceeds metadata input limit.`);
  const read = handle.read.bind(handle);
  let work = 0;
  return {
    sizeBytes,
    consume() {
      if (context.cancelled())
        throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
      if (++work > context.limits.maxChunks)
        throw new MediaAuthError(
          'RESOURCE_LIMIT',
          `${format} carrier/entry work exceeds the count budget.`,
        );
    },
    async range(offset, length) {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset > sizeBytes - length
      )
        invalidMetadata(`${format} carrier range extends beyond input.`);
      // Fixed headers or a bounded EXIF block; never arbitrary declared TIFF allocation.
      if (length > 65536)
        throw new MediaAuthError('RESOURCE_LIMIT', `${format} payload exceeds 64 KiB.`);
      const bytes = new Uint8Array(length);
      const step = Math.min(4096, context.limits.maxChunkBytes);
      for (let i = 0; i < length; i += step) {
        if (context.cancelled())
          throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
        const count = Math.min(step, length - i);
        const part = await read(offset + i, count);
        if (context.cancelled())
          throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
        if (part.byteLength !== count)
          invalidMetadata('Metadata adapter returned an incorrect byte range.');
        bytes.set(part, i);
      }
      return bytes;
    },
  };
}

export function metadataReadFailure(
  error: unknown,
  label: string,
  format: 'EXIF' | 'XMP',
): Unreadable {
  if (error instanceof MediaAuthError) {
    if (error.code === 'RESOURCE_LIMIT' || error.code === 'CANCELLED') throw error;
    return { status: 'INCONCLUSIVE', reason: error.message };
  }
  return {
    status: 'UNAVAILABLE',
    reason: `${label} ${format} bytes could not be read; no absence or authenticity finding is established.`,
  };
}
