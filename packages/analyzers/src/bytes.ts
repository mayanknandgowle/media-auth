import {
  MediaAuthError,
  validateLimits,
  type AnalysisContext,
  type MediaHandle,
} from '@media-auth/core';

export function checkInput(
  handle: MediaHandle,
  context: AnalysisContext,
): asserts handle is MediaHandle & Required<Pick<MediaHandle, 'stream'>> {
  if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Hashing was cancelled.');
  validateLimits(context.limits);
  if (
    !Number.isSafeInteger(context.limits.maxBytes) ||
    context.limits.maxBytes <= 0 ||
    !Number.isSafeInteger(handle.sizeBytes) ||
    handle.sizeBytes < 0
  ) {
    throw new MediaAuthError('INVALID_INPUT', 'Hashing requires a valid size and byte limit.');
  }
  if (handle.sizeBytes > context.limits.maxBytes)
    throw new MediaAuthError('RESOURCE_LIMIT', 'Media exceeds the hashing byte limit.');
  if (typeof handle.stream !== 'function')
    throw new MediaAuthError('UNSUPPORTED_MEDIA', 'SHA-256 requires byte-stream access.');
}

/** Enforces both declared length and actual stream length before passing bytes to native crypto. */
export async function* boundedChunks(
  handle: MediaHandle,
  context: AnalysisContext,
): AsyncIterable<Uint8Array> {
  checkInput(handle, context);
  let total = 0;
  let count = 0;
  for await (const chunk of handle.stream()) {
    if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Hashing was cancelled.');
    if (chunk.byteLength === 0)
      throw new MediaAuthError('INVALID_INPUT', 'Media stream returned an empty chunk.');
    if (++count > context.limits.maxChunks || chunk.byteLength > context.limits.maxChunkBytes)
      throw new MediaAuthError(
        'RESOURCE_LIMIT',
        'Media stream exceeds its chunk count or chunk byte limit.',
      );
    total += chunk.byteLength;
    if (total > context.limits.maxBytes || total > handle.sizeBytes)
      throw new MediaAuthError(
        'RESOURCE_LIMIT',
        'Media stream exceeds its declared size or byte limit.',
      );
    yield chunk;
  }
  if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Hashing was cancelled.');
  if (total !== handle.sizeBytes)
    throw new MediaAuthError('IO_ERROR', 'Media stream ended before its declared size.');
}
