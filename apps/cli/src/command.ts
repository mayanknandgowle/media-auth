import {
  DEFAULT_LIMITS,
  MediaAuthError,
  analyze,
  type AnalysisResult,
  type ContentHash,
  type ErrorCode,
  type MediaSource,
  type ResourceLimits,
} from '@media-auth/core';
import { createFoundationRegistry } from '@media-auth/analyzers';
import { nodeSha256Hasher } from '@media-auth/analyzers/node';
import { pngProbe } from '@media-auth/media';
import { openLocalFile } from './local-file.js';

export interface FingerprintResult {
  readonly schemaVersion: '1.0';
  readonly source: MediaSource;
  readonly sizeBytes: number;
  readonly identity: ContentHash;
  readonly limitations: readonly string[];
}

export interface ErrorResult {
  readonly schemaVersion: '1.0';
  readonly error: { readonly code: ErrorCode | 'USAGE_ERROR'; readonly message: string };
}

export type CommandResult =
  | { readonly exitCode: 0; readonly output: AnalysisResult | FingerprintResult }
  | { readonly exitCode: 1 | 2; readonly output: ErrorResult };

/** Successful analysis can contain UNAVAILABLE evidence; that is not a command failure. */
export async function executeCommand(
  args: readonly string[],
  limits: ResourceLimits = DEFAULT_LIMITS,
): Promise<CommandResult> {
  const [command, path] = args;
  if (args.length !== 2 || (command !== 'inspect' && command !== 'fingerprint') || !path) {
    return {
      exitCode: 2,
      output: {
        schemaVersion: '1.0',
        error: {
          code: 'USAGE_ERROR',
          message: 'Usage: media-auth <inspect|fingerprint> <local-file>',
        },
      },
    };
  }

  try {
    const input = await openLocalFile(path, limits);
    try {
      let output: AnalysisResult | FingerprintResult;
      if (command === 'inspect') {
        const descriptor = await pngProbe.probe(input.handle, input.source, limits);
        output = await analyze(
          { descriptor, handle: input.handle },
          createFoundationRegistry(nodeSha256Hasher),
          { limits },
        );
      } else {
        output = {
          schemaVersion: '1.0',
          source: input.source,
          sizeBytes: input.handle.sizeBytes,
          identity: await nodeSha256Hasher.hash(input.handle, { limits, cancelled: () => false }),
          limitations: [
            'SHA-256 establishes exact byte identity only; it does not assess perceptual similarity or authenticity.',
          ],
        };
      }
      await input.assertUnchanged();
      return { exitCode: 0, output };
    } finally {
      await input.close();
    }
  } catch (error) {
    return {
      exitCode: 1,
      output: {
        schemaVersion: '1.0',
        error:
          error instanceof MediaAuthError
            ? { code: error.code, message: error.message }
            : { code: 'IO_ERROR', message: 'Unable to read or analyze the local file.' },
      },
    };
  }
}
