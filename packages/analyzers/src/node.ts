import { createHash } from 'node:crypto';
import type { ExactHasher } from './contracts.js';
import { boundedChunks } from './bytes.js';

/** Streaming native SHA-256; this entry point is intentionally excluded from browser clients. */
export const nodeSha256Hasher: ExactHasher = {
  async hash(handle, context) {
    const digest = createHash('sha256');
    for await (const chunk of boundedChunks(handle, context)) digest.update(chunk);
    return { algorithm: 'SHA-256', value: digest.digest('hex') };
  },
};
