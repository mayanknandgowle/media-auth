import { MediaAuthError } from '@media-auth/core';
import type { ExactHasher } from './contracts.js';
import { boundedChunks, checkInput } from './bytes.js';

/** WebCrypto currently needs a complete buffer; allocation is bounded before it occurs. */
export const webSha256Hasher: ExactHasher = {
  async hash(handle, context) {
    checkInput(handle, context);
    if (!globalThis.crypto?.subtle)
      throw new MediaAuthError('IO_ERROR', 'Native WebCrypto SHA-256 is unavailable.');
    const bytes = new Uint8Array(handle.sizeBytes);
    let offset = 0;
    for await (const chunk of boundedChunks(handle, context)) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    if (context.cancelled()) throw new MediaAuthError('CANCELLED', 'Hashing was cancelled.');
    return {
      algorithm: 'SHA-256',
      value: Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    };
  },
};
