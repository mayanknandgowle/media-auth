import { describe, expect, it } from 'vitest';
import { exifComparisonText } from './exif-comparison.js';
import type { JsonValue } from '@media-auth/core';

const observations = [
  { kind: 'RECORDED', format: 'EXIF', field: 'pixelXDimension', value: 16 },
  { kind: 'RECORDED', format: 'EXIF', field: 'pixelYDimension', value: 8 },
] as const;
const dimensionComparison = {
  kind: 'NUMERIC_COMPARISON',
  status: 'MATCH',
  recorded: { width: 16, height: 8 },
  encoded: { width: 16, height: 8 },
};
const encoded = { width: 16, height: 8 };
describe('EXIF comparison presentation boundary', () => {
  it('checks every supplied comparison against the recorded dimensions and current axes', () => {
    const wrong: JsonValue[] = [
      null,
      {},
      { ...dimensionComparison, status: 'AUTHENTIC' },
      { ...dimensionComparison, kind: 'RECORDED' },
      { ...dimensionComparison, status: 'DIFFERENT' },
      { ...dimensionComparison, recorded: { width: 8, height: 16 } },
      { ...dimensionComparison, encoded: { width: 32, height: 16 } },
      { ...dimensionComparison, status: 'NOT_COMPARABLE', reason: '<script>' },
    ];
    for (const comparison of wrong)
      expect(() =>
        exifComparisonText(
          { kind: 'RECORDED', observations, dimensionComparison: comparison },
          encoded,
        ),
      ).toThrow('invalid');
    for (const changed of [
      [],
      observations.slice(0, 1),
      [...observations, observations[0]],
      observations.map((item) => ({ ...item, value: 0 })),
      observations.map((item) => ({ ...item, format: 'CONTAINER' })),
    ])
      expect(() =>
        exifComparisonText(
          { kind: 'RECORDED', observations: changed, dimensionComparison },
          encoded,
        ),
      ).toThrow('invalid');
  });
  it('labels missing dimensions without inventing numeric equality and tolerates older reports', () => {
    expect(exifComparisonText({ observations: [] }, encoded)).toBeUndefined();
    expect(
      exifComparisonText(
        {
          kind: 'RECORDED',
          observations: [],
          dimensionComparison: {
            kind: 'NUMERIC_COMPARISON',
            status: 'NOT_COMPARABLE',
            reason: 'Both positive recorded EXIF pixel dimensions are required.',
          },
        },
        encoded,
      ),
    ).toContain('No agreement or difference is established');
    expect(
      exifComparisonText({ kind: 'RECORDED', observations, dimensionComparison }, encoded),
    ).toContain('Agreement does not verify authenticity');
  });
});
