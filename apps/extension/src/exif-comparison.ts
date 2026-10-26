import { compareExifDimensions, type MetadataObservation } from '@media-auth/analyzers';
import type { JsonValue, MediaDescriptor } from '@media-auth/core';
import { isRecord } from './protocol.js';

/** Check derived display data against its recorded inputs; never trust a supplied MATCH. */
export function exifComparisonText(
  details: JsonValue,
  encoded: MediaDescriptor['dimensions'],
): string | undefined {
  if (!isRecord(details) || details.dimensionComparison === undefined) return;
  function invalid(): never {
    throw new Error('The EXIF dimension comparison is invalid.');
  }
  const supplied = details.dimensionComparison;
  if (details.kind !== 'RECORDED' || !isRecord(supplied) || !Array.isArray(details.observations))
    invalid();
  const observations: MetadataObservation[] = [];
  for (const item of details.observations) {
    if (!isRecord(item)) invalid();
    if (item.field !== 'pixelXDimension' && item.field !== 'pixelYDimension') continue;
    if (
      item.kind !== 'RECORDED' ||
      item.format !== 'EXIF' ||
      typeof item.value !== 'number' ||
      !Number.isInteger(item.value) ||
      item.value < 1 ||
      item.value > 0xffffffff ||
      observations.some((previous) => previous.field === item.field)
    )
      invalid();
    observations.push({ kind: 'RECORDED', format: 'EXIF', field: item.field, value: item.value });
  }
  const expected = compareExifDimensions(observations, encoded);
  if (supplied.kind !== expected.kind || supplied.status !== expected.status) invalid();
  if (expected.status === 'NOT_COMPARABLE') {
    if (supplied.reason !== expected.reason) invalid();
    return `Dimension comparison unavailable: ${expected.reason} No agreement or difference is established.`;
  }
  for (const [key, pair] of [
    ['recorded', expected.recorded],
    ['encoded', expected.encoded],
  ] as const) {
    const actual = supplied[key];
    if (!isRecord(actual) || actual.width !== pair.width || actual.height !== pair.height)
      invalid();
  }
  const values = `Recorded EXIF: ${expected.recorded.width} × ${expected.recorded.height} px; encoded image: ${expected.encoded.width} × ${expected.encoded.height} px.`;
  return `${values} ${expected.status === 'MATCH' ? 'Numbers match on encoded axes. Agreement does not verify authenticity.' : 'Numbers differ on encoded axes. Padding or historical/forged metadata may explain a difference; no cause, editing or authenticity is established.'} Orientation is not applied.`;
}
