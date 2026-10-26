import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '@media-auth/core';
import { executeCommand } from './command.js';
import { openLocalFile } from './local-file.js';

const fixturePath = fileURLToPath(new URL('../../../tests/fixtures/known.png', import.meta.url));
let temporaryDirectory: string;

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'media-auth-cli-'));
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('CLI commands', () => {
  it.each(['xmp-attributes.jpg', 'xmp-elements.jpg', 'xmp-attributes.webp', 'xmp-elements.webp'])(
    'inspects %s as separate recorded XMP evidence',
    async (name) => {
      const path = fileURLToPath(
        new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url),
      );
      const result = await executeCommand(['inspect', path]);
      if (result.exitCode !== 0 || !('evidence' in result.output))
        throw new Error('Expected report');
      expect(
        result.output.evidence.find(
          (item) => item.source.id === `media-auth.${name.endsWith('.webp') ? 'webp' : 'jpeg'}-xmp`,
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
        result.output.evidence.find(
          (item) =>
            item.source.id === `media-auth.${name.endsWith('.webp') ? 'webp' : 'jpeg'}-exif`,
        ),
      ).toHaveProperty('status', 'DETECTED');
      expect(result.output.conclusion).toMatchObject({
        origin: 'UNKNOWN',
        modification: 'UNKNOWN',
      });
      const bytes = await readFile(path);
      const index = bytes.indexOf(Buffer.from('r:about=""'));
      expect(index).toBeGreaterThan(0);
      bytes[index + 9] = 88;
      const malformed = join(
        temporaryDirectory,
        `invalid-xmp.${name.endsWith('.webp') ? 'webp' : 'jpg'}`,
      );
      await writeFile(malformed, bytes);
      const bad = await executeCommand(['inspect', malformed]);
      if (bad.exitCode !== 0 || !('evidence' in bad.output)) throw new Error('Expected report');
      expect(
        bad.output.evidence.find(
          (item) => item.source.id === `media-auth.${name.endsWith('.webp') ? 'webp' : 'jpeg'}-xmp`,
        ),
      ).toHaveProperty('status', 'INCONCLUSIVE');
      expect(bad.output.evidence.find((item) => item.category === 'EXACT_IDENTITY')).toHaveProperty(
        'status',
        'DETECTED',
      );
    },
  );
  it.each(['jpg', 'webp', 'png'])(
    'reports recorded %s dimension comparisons only in inspect',
    async (format) => {
      for (const state of ['match', 'different']) {
        const path = fileURLToPath(
          new URL(
            `../../../tests/fixtures/metadata/dimensions-${state}.${format}`,
            import.meta.url,
          ),
        );
        const result = await executeCommand(['inspect', path]);
        if (result.exitCode !== 0 || !('evidence' in result.output))
          throw new Error('Expected inspection');
        const exif = result.output.evidence.find(
          (item) => item.source.id === `media-auth.${format === 'jpg' ? 'jpeg' : format}-exif`,
        );
        expect(exif).toMatchObject({
          status: 'DETECTED',
          details: {
            dimensionComparison: {
              kind: 'NUMERIC_COMPARISON',
              status: state === 'match' ? 'MATCH' : 'DIFFERENT',
              encoded: { width: 16, height: 8 },
              recorded: { width: state === 'match' ? 16 : 32, height: state === 'match' ? 8 : 16 },
            },
          },
        });
        expect(result.output.conclusion).toMatchObject({
          verdict: 'INCONCLUSIVE',
          origin: 'UNKNOWN',
          modification: 'UNKNOWN',
        });
        const probe = await executeCommand(['probe', path]);
        expect(probe).toMatchObject({
          exitCode: 0,
          output: {
            media: { dimensions: { width: 16, height: 8 }, metadataAvailability: 'NOT_PROBED' },
          },
        });
        expect(probe.output).not.toHaveProperty('evidence');
      }
    },
  );
  it('probes PNG with a tight payload/read budget and rejects smaller payload budgets', async () => {
    // The largest fixture chunk is 40 bytes; CRC scanning also covers its four-byte type.
    expect(
      await executeCommand(['probe', fixturePath], { ...DEFAULT_LIMITS, maxChunkBytes: 40 }),
    ).toMatchObject({
      exitCode: 0,
      output: { media: { mimeType: 'image/png', dimensions: { width: 1, height: 1 } } },
    });
    expect(
      await executeCommand(['probe', fixturePath], { ...DEFAULT_LIMITS, maxChunkBytes: 39 }),
    ).toMatchObject({ exitCode: 1, output: { error: { code: 'RESOURCE_LIMIT' } } });
  });
  it.each([
    ['baseline.jpg', 'image/jpeg', 16, 8],
    ['progressive.jpg', 'image/jpeg', 16, 8],
    ['lossy.webp', 'image/webp', 16, 8],
    ['lossless.webp', 'image/webp', 16, 8],
    ['alpha.webp', 'image/webp', 16, 8],
    ['single87.gif', 'image/gif', 16, 8],
    ['transparent-interlaced.gif', 'image/gif', 16, 8],
    ['rgb24-bottom-up.bmp', 'image/bmp', 3, 2],
    ['rgb24-top-down.bmp', 'image/bmp', 3, 2],
  ] as const)(
    'probes and inspects %s without stronger authenticity claims',
    async (name, mimeType, width, height) => {
      const bytes = await readFile(new URL(`../../../tests/fixtures/${name}`, import.meta.url));
      const path = join(temporaryDirectory, 'misleading.png');
      await writeFile(path, bytes);
      const result = await executeCommand(['probe', path]);
      expect(result).toMatchObject({
        exitCode: 0,
        output: {
          schemaVersion: '1.0',
          media: {
            mimeType,
            dimensions: { width, height },
          },
        },
      });
      expect(Object.keys(result.output).sort()).toEqual(['media', 'schemaVersion']);
      const inspected = await executeCommand(['inspect', path]);
      if (inspected.exitCode !== 0 || !('analyzers' in inspected.output))
        throw new Error('Expected image analysis.');
      expect(
        inspected.output.analyzers.filter((analyzer) => analyzer.status === 'UNAVAILABLE'),
      ).toHaveLength(['image/jpeg', 'image/webp'].includes(mimeType) ? 8 : 10);
      expect(inspected.output.conclusion.verdict).toBe('INCONCLUSIVE');
      expect(inspected.output.evidence.find((item) => item.category === 'METADATA')).toMatchObject({
        source: { id: 'media-auth.container-metadata', version: '0.5.0' },
        details: {
          kind: 'RECORDED',
          observations: [
            { kind: 'RECORDED', format: 'CONTAINER', field: 'width', value: width },
            { kind: 'RECORDED', format: 'CONTAINER', field: 'height', value: height },
          ],
        },
      });
      expect(inspected.output.evidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'METADATA', status: 'DETECTED' }),
        ]),
      );
      expect(await executeCommand(['inspect', path])).toEqual(inspected);
      await writeFile(path, bytes.subarray(0, bytes.length - 1));
      expect(await executeCommand(['probe', path])).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'INVALID_INPUT' } },
      });
    },
  );

  it.each([
    'exif-little.jpg',
    'exif-big.jpg',
    'exif-little.webp',
    'exif-big.webp',
    'exif-little.png',
    'exif-big.png',
  ])('keeps %s probe-only output separate from recorded EXIF inspection', async (name) => {
    const path = fileURLToPath(
      new URL(`../../../tests/fixtures/metadata/${name}`, import.meta.url),
    );
    const probed = await executeCommand(['probe', path]);
    expect(Object.keys(probed.output).sort()).toEqual(['media', 'schemaVersion']);
    expect(probed).toMatchObject({
      exitCode: 0,
      output: {
        media: {
          dimensions: { width: 16, height: 8 },
          metadataAvailability: 'NOT_PROBED',
        },
      },
    });
    const inspected = await executeCommand(['inspect', path]);
    if (inspected.exitCode !== 0 || !('evidence' in inspected.output))
      throw new Error('Expected report');
    const carrier = name.endsWith('.jpg') ? 'jpeg' : name.endsWith('.png') ? 'png' : 'webp';
    const analyzerId = `media-auth.${carrier}-exif`;
    expect(inspected.output.evidence.find((e) => e.source.id === analyzerId)).toMatchObject({
      status: 'DETECTED',
      details: {
        kind: 'RECORDED',
        observations: expect.arrayContaining([
          { kind: 'RECORDED', format: 'EXIF', field: 'software', value: 'MediaAuth <fixture>' },
          {
            kind: 'RECORDED',
            format: 'EXIF',
            field: 'orientation',
            value: name.includes('little') ? 6 : 1,
          },
        ]),
      },
    });
    expect(inspected.output.conclusion).toMatchObject({
      verdict: 'INCONCLUSIVE',
      origin: 'UNKNOWN',
    });
    // Corrupt only TIFF magic: valid container framing, unusable selected metadata.
    const bytes = await readFile(path);
    bytes.writeUInt16LE(43, carrier === 'jpeg' ? 14 : carrier === 'png' ? 43 : 66);
    if (carrier === 'png') bytes.writeUInt32BE(crc32(bytes.subarray(37, 311)), 311);
    const malformed = join(temporaryDirectory, 'bad-exif.bin');
    await writeFile(malformed, bytes);
    const result = await executeCommand(['inspect', malformed]);
    if (result.exitCode !== 0 || !('evidence' in result.output)) throw new Error('Expected report');
    expect(result.output.evidence.find((e) => e.source.id === analyzerId)).toMatchObject({
      status: 'INCONCLUSIVE',
    });
    expect(result.output.evidence.find((e) => e.category === 'EXACT_IDENTITY')).toHaveProperty(
      'status',
      'DETECTED',
    );
  });

  it('inspects the deterministic PNG and reports unavailable analysis without an authenticity claim', async () => {
    const result = await executeCommand(['inspect', fixturePath]);
    expect(result.exitCode).toBe(0);
    if (result.exitCode !== 0 || !('analyzers' in result.output))
      throw new Error('Expected analysis result.');
    expect(result.output.media).toMatchObject({
      mimeType: 'image/png',
      dimensions: { width: 1, height: 1 },
      source: { acquisition: 'LOCAL_FILE', label: 'known.png' },
    });
    expect(result.output.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'AI_GENERATION', status: 'UNAVAILABLE' }),
        expect.objectContaining({ category: 'PROVENANCE', status: 'UNAVAILABLE' }),
        expect.objectContaining({ category: 'EXACT_IDENTITY', status: 'DETECTED' }),
      ]),
    );
    expect(['UNKNOWN', 'INCONCLUSIVE']).toContain(result.output.conclusion.verdict);
    expect(result.output.conclusion.origin).toBe('UNKNOWN');
    expect(JSON.parse(JSON.stringify(result.output))).toEqual(result.output);
  });

  it('returns structured GIF unsupported/budget errors without partial analysis', async () => {
    const bytes = await readFile(new URL('../../../tests/fixtures/single87.gif', import.meta.url));
    const path = join(temporaryDirectory, 'input.gif');
    const multiple = Buffer.concat([bytes.subarray(0, -1), bytes.subarray(19)]);
    await writeFile(path, multiple);
    for (const command of ['probe', 'inspect']) {
      const result = await executeCommand([command, path]);
      expect(result).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'UNSUPPORTED_MEDIA' } },
      });
      expect(Object.keys(result.output).sort()).toEqual(['error', 'schemaVersion']);
    }
    await writeFile(path, bytes);
    expect(
      await executeCommand(['probe', path], { ...DEFAULT_LIMITS, maxPixels: 127 }),
    ).toMatchObject({ exitCode: 1, output: { error: { code: 'RESOURCE_LIMIT' } } });
  });

  it('is deterministic for the same file', async () => {
    expect(await executeCommand(['inspect', fixturePath])).toEqual(
      await executeCommand(['inspect', fixturePath]),
    );
  });

  it('hashes arbitrary regular-file bytes without implying media recognition', async () => {
    const path = join(temporaryDirectory, 'abc.bin');
    await writeFile(path, 'abc');
    const result = await executeCommand(['fingerprint', path]);
    expect(result).toMatchObject({
      exitCode: 0,
      output: {
        sizeBytes: 3,
        identity: {
          algorithm: 'SHA-256',
          value: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        },
      },
    });
  });

  it.each([
    [],
    ['inspect'],
    ['analyze', 'file.png'],
    ['provenance', 'file.png'],
    ['inspect', 'a', 'b'],
  ])('rejects unsupported command arguments %j with a usage error', async (...args: string[]) => {
    expect(await executeCommand(args)).toMatchObject({
      exitCode: 2,
      output: { error: { code: 'USAGE_ERROR' } },
    });
  });

  it('rejects missing input and never exposes a raw filesystem error', async () => {
    const path = join(temporaryDirectory, 'does-not-exist.png');
    const result = await executeCommand(['inspect', path]);
    expect(result).toMatchObject({ exitCode: 1, output: { error: { code: 'IO_ERROR' } } });
    expect(JSON.stringify(result)).not.toContain(temporaryDirectory);
  });

  it('rejects invalid media', async () => {
    const path = join(temporaryDirectory, 'invalid.png');
    await writeFile(path, 'this is not an image');
    const result = await executeCommand(['inspect', path]);
    expect(result.exitCode).toBe(1);
    if (result.exitCode === 0) throw new Error('Expected invalid media error.');
    expect(['INVALID_INPUT', 'UNSUPPORTED_MEDIA']).toContain(result.output.error.code);
  });

  it('rejects oversized inputs before inspection or hashing', async () => {
    const path = join(temporaryDirectory, 'oversized.png');
    await writeFile(path, '');
    await truncate(path, DEFAULT_LIMITS.maxBytes + 1);
    for (const command of ['probe', 'inspect', 'fingerprint']) {
      expect(await executeCommand([command, path])).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'RESOURCE_LIMIT' } },
      });
    }
  });

  it('rejects directories and URL inputs', async () => {
    for (const path of [temporaryDirectory, 'https://example.invalid/file.png']) {
      expect(await executeCommand(['inspect', path])).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'INVALID_INPUT' } },
      });
    }
  });
});

describe('bounded local media handle', () => {
  it('enforces a caller-supplied range-read limit before allocating or reading', async () => {
    const input = await openLocalFile(fixturePath, { ...DEFAULT_LIMITS, maxChunkBytes: 4 });
    try {
      expect(await input.handle.read(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
      await expect(input.handle.read(0, 5)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    } finally {
      await input.close();
    }
  });
  it('reads exact ranges and streams bounded chunks', async () => {
    const path = join(temporaryDirectory, 'bytes.bin');
    const bytes = new Uint8Array(70 * 1024).fill(42);
    await writeFile(path, bytes);
    const input = await openLocalFile(path, DEFAULT_LIMITS);
    try {
      expect(await input.handle.read(2, 3)).toEqual(new Uint8Array([42, 42, 42]));
      const sizes: number[] = [];
      for await (const chunk of input.handle.stream()) sizes.push(chunk.byteLength);
      expect(sizes).toEqual([64 * 1024, 6 * 1024]);
      await expect(input.handle.read(-1, 1)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      await expect(input.handle.read(bytes.length, 1)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      await expect(input.handle.read(0, bytes.length)).rejects.toMatchObject({
        code: 'RESOURCE_LIMIT',
      });
    } finally {
      await input.close();
    }
    await expect(input.handle.read(0, 1)).rejects.toMatchObject({ code: 'IO_ERROR' });
  });

  it('rejects an input changed while its handle is open', async () => {
    const path = join(temporaryDirectory, 'changing.bin');
    await writeFile(path, 'abc');
    const input = await openLocalFile(path, DEFAULT_LIMITS);
    try {
      await writeFile(path, 'abcdef');
      await expect(input.handle.read(0, 1)).rejects.toMatchObject({ code: 'IO_ERROR' });
    } finally {
      await input.close();
    }
  });

  it('rejects invalid limits rather than entering an unbounded stream loop', async () => {
    await expect(
      openLocalFile(fixturePath, { ...DEFAULT_LIMITS, maxChunkBytes: 0 }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT',
    });
  });
});
