import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIMITS } from '@media-auth/core';
import { analyzeSelectedFile, readSelectedFile, type SelectedFile } from './local-file.js';
import { createReportView } from './report.js';

function selected(bytes: Uint8Array, size = bytes.length): SelectedFile {
  return {
    name: '<img onerror=alert(1)>.png',
    size,
    stream: () =>
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  };
}

describe('selected browser files', () => {
  it.each([
    'xmp-attributes.jpg',
    'xmp-elements.jpg',
    'xmp-attributes.webp',
    'xmp-elements.webp',
    'xmp-attributes.png',
    'xmp-elements.png',
  ])('exports selected local %s claims without mixing XMP with EXIF', async (name) => {
    const bytes = readFileSync(
      new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url),
    );
    const report = await analyzeSelectedFile(selected(bytes));
    const view = createReportView(report);
    expect(
      view.evidence.find(
        (item) =>
          item.source.id ===
          `media-auth.${name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpeg'}-xmp`,
      ),
    ).toMatchObject({
      status: 'DETECTED',
      details: {
        observations: expect.arrayContaining([
          {
            kind: 'RECORDED',
            format: 'XMP',
            field: 'creatorTool',
            value: 'MediaAuth <fixture> & café 📷',
          },
        ]),
      },
    });
    expect(
      view.dimensionComparisons.has(
        `media-auth.${name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpeg'}-xmp:recorded`,
      ),
    ).toBe(false);
    expect(JSON.parse(view.json)).toEqual(report);
    expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
    expect(report.conclusion.modification).toBe('UNKNOWN');
  });
  it.each(['jpg', 'webp', 'png'])(
    'exports %s dimension agreement and differences with separate labels',
    async (format) => {
      for (const state of ['match', 'different']) {
        const bytes = readFileSync(
          new URL(
            `../../../tests/fixtures/metadata/dimensions-${state}.${format}`,
            import.meta.url,
          ),
        );
        const report = await analyzeSelectedFile(selected(bytes));
        const view = createReportView(report);
        const comparison = view.dimensionComparisons.get(
          `media-auth.${format === 'jpg' ? 'jpeg' : format}-exif:recorded`,
        );
        expect(comparison).toContain(
          state === 'match' ? 'Numbers match on encoded axes' : 'Numbers differ on encoded axes',
        );
        expect(comparison).toContain('Orientation is not applied');
        if (state === 'different')
          expect(comparison).toContain('Padding or historical/forged metadata');
        expect(JSON.parse(view.json)).toEqual(report);
        expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
        expect(report.conclusion.modification).toBe('UNKNOWN');
      }
    },
  );
  it.each([
    'known.png',
    'baseline.jpg',
    'progressive.jpg',
    'lossy.webp',
    'lossless.webp',
    'alpha.webp',
    'single87.gif',
    'transparent-interlaced.gif',
    'rgb24-bottom-up.bmp',
    'rgb24-top-down.bmp',
  ])('inspects %s locally by bytes and produces a bounded export view', async (name) => {
    const bytes = readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
    const report = await analyzeSelectedFile(selected(bytes));
    expect(report.media.source).toEqual({
      acquisition: 'LOCAL_FILE',
      label: '<img onerror=alert(1)>.png',
    });
    expect(report.conclusion.verdict).toBe('INCONCLUSIVE');
    expect(report.analyzers.filter((item) => item.status === 'UNAVAILABLE')).toHaveLength(
      ['.jpg', '.webp', '.png'].some((extension) => name.endsWith(extension)) ? 9 : 11,
    );
    const view = createReportView(report);
    expect(view.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(view.json)).toEqual(report);
  });

  it.each(['jpg', 'webp', 'png'])(
    'exports recorded %s EXIF separately from encoded facts and conservative conclusions',
    async (format) => {
      const bytes = readFileSync(
        new URL(`../../../tests/fixtures/metadata/exif-little.${format}`, import.meta.url),
      );
      const report = await analyzeSelectedFile(selected(bytes));
      const view = createReportView(report);
      expect(report.media.dimensions).toEqual({ width: 16, height: 8 });
      expect(
        view.evidence.find(
          (e) => e.source.id === `media-auth.${format === 'jpg' ? 'jpeg' : format}-exif`,
        ),
      ).toMatchObject({
        status: 'DETECTED',
        details: {
          kind: 'RECORDED',
          observations: expect.arrayContaining([
            { kind: 'RECORDED', format: 'EXIF', field: 'orientation', value: 6 },
            { kind: 'RECORDED', format: 'EXIF', field: 'cameraMake', value: 'MediaAuth' },
          ]),
        },
      });
      expect(JSON.parse(view.json)).toEqual(report);
      expect(report.conclusion.origin).toBe('UNKNOWN');
    },
  );

  it('checks empty/oversized/invalid size and limits before reading', async () => {
    const stream = vi.fn(() => new ReadableStream<Uint8Array>());
    for (const size of [0, -1, NaN, Infinity, 0.5, DEFAULT_LIMITS.maxBytes + 1])
      await expect(readSelectedFile({ name: 'x', size, stream })).rejects.toThrow();
    await expect(
      readSelectedFile({ name: 'x', size: 1, stream }, { ...DEFAULT_LIMITS, maxChunks: 0 }),
    ).rejects.toThrow();
    await expect(
      readSelectedFile({ name: 'x', size: 1, stream }, DEFAULT_LIMITS, 0),
    ).rejects.toThrow();
    expect(stream).not.toHaveBeenCalled();
  });

  it('rejects incomplete, excessive, and chunk-flood streams and cancels on failure', async () => {
    await expect(readSelectedFile(selected(new Uint8Array(2), 3))).rejects.toThrow('ended');
    await expect(readSelectedFile(selected(new Uint8Array(4), 3))).rejects.toThrow('declared size');
    await expect(
      readSelectedFile(selected(new Uint8Array(3)), { ...DEFAULT_LIMITS, maxChunkBytes: 2 }),
    ).rejects.toThrow('chunk');
    const cancel = vi.fn();
    const file = {
      name: 'x',
      size: 1,
      stream: () =>
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array());
          },
          cancel,
        }),
    };
    await expect(readSelectedFile(file, { ...DEFAULT_LIMITS, maxChunks: 2 })).rejects.toThrow(
      'chunk',
    );
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels a hung read on the acquisition deadline without retaining a live timer', async () => {
    const cancel = vi.fn();
    await expect(
      readSelectedFile(
        { name: 'x', size: 1, stream: () => new ReadableStream({ cancel }) },
        DEFAULT_LIMITS,
        10,
      ),
    ).rejects.toThrow('timed out');
    expect(cancel).toHaveBeenCalled();
    expect(await readSelectedFile(selected(new Uint8Array([7])))).toEqual(new Uint8Array([7]));
  });

  it('rejects unsupported or malformed content despite an image filename', async () => {
    await expect(
      analyzeSelectedFile(selected(new TextEncoder().encode('<svg></svg>'))),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    const bytes = readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url));
    await expect(analyzeSelectedFile(selected(bytes.subarray(0, 20)))).rejects.toThrow();
  });
});

describe('report presentation boundary', () => {
  const fixture = readFileSync(new URL('../../../tests/fixtures/known.png', import.meta.url));
  it('rejects malformed fields, excessive reports, hashes, and missing evidence references', async () => {
    const report = await analyzeSelectedFile(selected(fixture));
    const mutations = [
      { ...report, schemaVersion: '2' },
      { ...report, evidence: [...report.evidence, ...report.evidence] },
      { ...report, limitations: Array.from({ length: 65 }, () => 'x') },
      { ...report, media: { ...report.media, sizeBytes: DEFAULT_LIMITS.maxBytes + 1 } },
      { ...report, media: { ...report.media, dimensions: { width: 1, height: 0 } } },
      { ...report, conclusion: { ...report.conclusion, evidenceIds: [] } },
      { ...report, conclusion: { ...report.conclusion, verdict: 'AUTHENTIC' } },
      { ...report, limitations: ['x'.repeat(65537)] },
      {
        ...report,
        evidence: report.evidence.map((item) =>
          item.category === 'EXACT_IDENTITY'
            ? { ...item, details: { kind: 'EXACT', algorithm: 'SHA-256', value: '<script>' } }
            : item,
        ),
      },
    ];
    for (const value of [null, [], {}, ...mutations])
      expect(() => createReportView(value)).toThrow();
  });
});
