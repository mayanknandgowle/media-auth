import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type CompleteMediaHandle,
  type ResourceLimits,
} from '@media-auth/core';
import { validateSize } from './limits.js';

/** Takes an immutable snapshot; returned reads cannot modify the stored input. */
export function createMemoryHandle(
  bytes: Uint8Array,
  limits: ResourceLimits = DEFAULT_LIMITS,
): CompleteMediaHandle {
  validateSize(bytes.byteLength, limits);
  const snapshot = Uint8Array.from(bytes);
  return {
    sizeBytes: snapshot.byteLength,
    async read(offset, length) {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset > snapshot.byteLength - length
      ) {
        throw new MediaAuthError('INVALID_INPUT', 'Requested byte range is outside the media.');
      }
      return snapshot.slice(offset, offset + length);
    },
    async *stream() {
      for (let offset = 0; offset < snapshot.byteLength; offset += 64 * 1024) {
        yield snapshot.slice(offset, offset + 64 * 1024);
      }
    },
  };
}
