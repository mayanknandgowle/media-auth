import {
  DEFAULT_LIMITS,
  MediaAuthError,
  validateLimits,
  type ResourceLimits,
} from '@media-auth/core';
import { analyzeAcquiredImage } from './workflow.js';

export interface SelectedFile {
  readonly name: string;
  readonly size: number;
  stream(): ReadableStream<Uint8Array>;
}

/** Explicit user-selected file only. No arbitrary paths, FileReader whole-file read, or messages. */
export async function readSelectedFile(
  file: SelectedFile,
  limits: ResourceLimits = DEFAULT_LIMITS,
  timeoutMs = 10_000,
): Promise<Uint8Array> {
  validateLimits(limits);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000)
    throw new MediaAuthError('RESOURCE_LIMIT', 'Invalid file acquisition deadline.');
  if (!Number.isSafeInteger(file.size) || file.size <= 0)
    throw new MediaAuthError('INVALID_INPUT', 'Choose a nonempty image file.');
  if (file.size > limits.maxBytes)
    throw new MediaAuthError('RESOURCE_LIMIT', 'Choose an image no larger than 8 MiB.');
  const reader = file.stream().getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new MediaAuthError('RESOURCE_LIMIT', 'Local file reading timed out.')),
      timeoutMs,
    );
  });
  const bytes = new Uint8Array(file.size);
  let offset = 0;
  let chunks = 0;
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) break;
      if (++chunks > limits.maxChunks || part.value.byteLength > limits.maxChunkBytes)
        throw new MediaAuthError('RESOURCE_LIMIT', 'The file exceeds the stream chunk limit.');
      if (part.value.byteLength > file.size - offset)
        throw new MediaAuthError(
          'INVALID_INPUT',
          'The file changed or exceeded its declared size.',
        );
      bytes.set(part.value, offset);
      offset += part.value.byteLength;
    }
    if (offset !== file.size)
      throw new MediaAuthError('INVALID_INPUT', 'The file ended before its declared size.');
    return bytes;
  } finally {
    clearTimeout(timer);
    // Do not let an adapter's cancellation promise hold up the completed/error UI.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function analyzeSelectedFile(file: SelectedFile) {
  const bytes = await readSelectedFile(file);
  return analyzeAcquiredImage(bytes, { acquisition: 'LOCAL_FILE', label: file.name.slice(0, 160) });
}
