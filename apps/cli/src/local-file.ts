import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  MediaAuthError,
  validateLimits,
  type CompleteMediaHandle,
  type MediaSource,
  type ResourceLimits,
} from '@media-auth/core';

const READ_CHUNK_BYTES = 64 * 1024;

export interface LocalFile {
  readonly handle: CompleteMediaHandle;
  readonly source: MediaSource;
  assertUnchanged(): Promise<void>;
  close(): Promise<void>;
}

function requireRegularFile(stat: BigIntStats): void {
  if (!stat.isFile()) {
    throw new MediaAuthError(
      'INVALID_INPUT',
      'Input must be a regular file; links and devices are unsupported.',
    );
  }
}

function requireSameFile(expected: BigIntStats, actual: BigIntStats): void {
  requireRegularFile(actual);
  if (
    expected.dev !== actual.dev ||
    expected.ino !== actual.ino ||
    expected.size !== actual.size ||
    expected.mtimeNs !== actual.mtimeNs ||
    expected.ctimeNs !== actual.ctimeNs
  ) {
    throw new MediaAuthError(
      'IO_ERROR',
      'Input changed during analysis; retry with a stable file.',
    );
  }
}

/** No URL fetching, temporary copies, or whole-file reads. The caller owns this lifetime. */
export async function openLocalFile(path: string, limits: ResourceLimits): Promise<LocalFile> {
  validateLimits(limits);
  if (!path || path.includes('\0') || /^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    throw new MediaAuthError('INVALID_INPUT', 'Provide a local file path, not a URL.');
  }
  const initial = await lstat(path, { bigint: true });
  requireRegularFile(initial);
  if (initial.size > BigInt(limits.maxBytes)) {
    throw new MediaAuthError('RESOURCE_LIMIT', `Input exceeds the ${limits.maxBytes} byte limit.`);
  }

  // Unix flags prevent a raced FIFO open from blocking and reject a raced symlink.
  // Windows does not expose these constants; fstat still verifies the opened identity.
  const flags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0);
  const file: FileHandle = await open(path, flags);
  try {
    requireSameFile(initial, await file.stat({ bigint: true }));
    const sizeBytes = Number(initial.size);
    const chunkBytes = Math.min(READ_CHUNK_BYTES, limits.maxChunkBytes);
    let closed = false;

    async function assertUnchanged(): Promise<void> {
      if (closed) throw new MediaAuthError('IO_ERROR', 'Input handle has been closed.');
      requireSameFile(initial, await file.stat({ bigint: true }));
    }

    async function read(offset: number, length: number): Promise<Uint8Array> {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset > sizeBytes ||
        length > sizeBytes - offset
      ) {
        throw new MediaAuthError('INVALID_INPUT', 'Requested file range is out of bounds.');
      }
      if (length > READ_CHUNK_BYTES) {
        throw new MediaAuthError(
          'RESOURCE_LIMIT',
          'Requested file range exceeds the 64 KiB read limit.',
        );
      }
      await assertUnchanged();
      const bytes = new Uint8Array(length);
      let total = 0;
      while (total < length) {
        const result = await file.read(bytes, total, length - total, offset + total);
        if (result.bytesRead === 0) {
          throw new MediaAuthError('IO_ERROR', 'Input ended before the requested file range.');
        }
        total += result.bytesRead;
      }
      await assertUnchanged();
      return bytes;
    }

    const handle: CompleteMediaHandle = {
      sizeBytes,
      read,
      async *stream() {
        let chunks = 0;
        for (let offset = 0; offset < sizeBytes; offset += chunkBytes) {
          if (++chunks > limits.maxChunks) {
            throw new MediaAuthError('RESOURCE_LIMIT', 'Input exceeds the stream chunk limit.');
          }
          yield await read(offset, Math.min(chunkBytes, sizeBytes - offset));
        }
        await assertUnchanged();
      },
    };

    return {
      handle,
      source: { acquisition: 'LOCAL_FILE', label: basename(path) },
      assertUnchanged,
      async close() {
        if (!closed) {
          closed = true;
          await file.close();
        }
      },
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}
