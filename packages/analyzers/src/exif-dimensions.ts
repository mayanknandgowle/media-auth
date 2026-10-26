import type { MediaDescriptor } from '@media-auth/core';
import type { MetadataObservation } from './contracts.js';

type Pair = { readonly width: number; readonly height: number };
export type ExifDimensionComparison =
  | {
      readonly kind: 'NUMERIC_COMPARISON';
      readonly status: 'MATCH' | 'DIFFERENT';
      readonly recorded: Pair;
      readonly encoded: Pair;
    }
  | {
      readonly kind: 'NUMERIC_COMPARISON';
      readonly status: 'NOT_COMPARABLE';
      readonly reason: string;
    };

/** Numeric equality only: no orientation, conflict resolution or authenticity inference. */
export function compareExifDimensions(
  observations: readonly MetadataObservation[],
  encoded: MediaDescriptor['dimensions'],
): ExifDimensionComparison {
  function scalar(field: string) {
    const entries = observations.filter(
      (item) => item.kind === 'RECORDED' && item.format === 'EXIF' && item.field === field,
    );
    const value = entries[0]?.value;
    return entries.length === 1 &&
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value > 0 &&
      value <= 0xffffffff
      ? value
      : undefined;
  }
  const width = scalar('pixelXDimension');
  const height = scalar('pixelYDimension');
  const kind = 'NUMERIC_COMPARISON';
  if (width === undefined || height === undefined)
    return {
      kind,
      status: 'NOT_COMPARABLE',
      reason: 'Both positive recorded EXIF pixel dimensions are required.',
    };
  if (
    !encoded ||
    !Number.isSafeInteger(encoded.width) ||
    !Number.isSafeInteger(encoded.height) ||
    encoded.width <= 0 ||
    encoded.height <= 0
  )
    return {
      kind,
      status: 'NOT_COMPARABLE',
      reason: 'Positive encoded dimensions are unavailable.',
    };
  return {
    kind,
    status: width === encoded.width && height === encoded.height ? 'MATCH' : 'DIFFERENT',
    recorded: { width, height },
    encoded: { width: encoded.width, height: encoded.height },
  };
}
