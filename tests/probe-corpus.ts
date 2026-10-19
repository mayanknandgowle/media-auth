import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import type { MediaProbe, ResourceLimits } from '@media-auth/core';
import { pngProbe, jpegProbe, webpProbe, gifProbe, bmpProbe } from '@media-auth/media';

export const seeds = [
  { name: 'rgb24-bottom-up.bmp', probe: bmpProbe, mimeType: 'image/bmp', width: 3, height: 2 },
  { name: 'rgb24-top-down.bmp', probe: bmpProbe, mimeType: 'image/bmp', width: 3, height: 2 },
  { name: 'known.png', probe: pngProbe, mimeType: 'image/png', width: 1, height: 1 },
  { name: 'baseline.jpg', probe: jpegProbe, mimeType: 'image/jpeg', width: 16, height: 8 },
  { name: 'progressive.jpg', probe: jpegProbe, mimeType: 'image/jpeg', width: 16, height: 8 },
  { name: 'lossy.webp', probe: webpProbe, mimeType: 'image/webp', width: 16, height: 8 },
  { name: 'lossless.webp', probe: webpProbe, mimeType: 'image/webp', width: 16, height: 8 },
  { name: 'alpha.webp', probe: webpProbe, mimeType: 'image/webp', width: 16, height: 8 },
  { name: 'single87.gif', probe: gifProbe, mimeType: 'image/gif', width: 16, height: 8 },
  {
    name: 'transparent-interlaced.gif',
    probe: gifProbe,
    mimeType: 'image/gif',
    width: 16,
    height: 8,
  },
].map((seed) => ({
  ...seed,
  bytes: readFileSync(new URL(`./fixtures/${seed.name}`, import.meta.url)),
}));

export interface CorpusCase {
  name: string;
  probe: MediaProbe;
  bytes: Uint8Array;
  expected: 'ACCEPT' | 'INVALID_INPUT' | 'UNSUPPORTED_MEDIA' | 'RESOURCE_LIMIT';
  limits?: Partial<ResourceLimits>;
}

export function pngChunk(type: string, payload: Uint8Array): Buffer {
  const bytes = Buffer.alloc(payload.length + 12);
  bytes.writeUInt32BE(payload.length);
  bytes.write(type, 4, 'ascii');
  bytes.set(payload, 8);
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4);
  return bytes;
}

function fixture(name: string): Buffer {
  const seed = seeds.find((item) => item.name === name);
  if (!seed) throw new Error(`Unknown corpus seed: ${name}`);
  return Buffer.from(seed.bytes);
}

/** Named, original byte recipes: no downloaded corpus or production parser as oracle. */
export function buildCorpus(): CorpusCase[] {
  const cases: CorpusCase[] = [];
  for (const seed of seeds) {
    for (const [name, bytes, expected, limits] of [
      ['positive-control', seed.bytes, 'ACCEPT', {}],
      ['truncated-ending', seed.bytes.subarray(0, -1), 'INVALID_INPUT', {}],
      ['trailing-zero', Buffer.concat([seed.bytes, Buffer.from([0])]), 'INVALID_INPUT', {}],
      ['concatenated-stream', Buffer.concat([seed.bytes, seed.bytes]), 'INVALID_INPUT', {}],
      ['input-budget', seed.bytes, 'RESOURCE_LIMIT', { maxBytes: seed.bytes.length - 1 }],
      ['two-byte-read-budget', seed.bytes, 'RESOURCE_LIMIT', { maxChunkBytes: 2 }],
    ] as const)
      cases.push({ name: `${seed.name}/${name}`, probe: seed.probe, bytes, expected, limits });
  }
  const png = fixture('known.png');
  const corruptPng = Buffer.from(png);
  corruptPng[29] = (corruptPng[29] ?? 0) ^ 1;
  const hugeHeader = Buffer.from(png.subarray(16, 29));
  hugeHeader.writeUInt32BE(100_000, 0);
  hugeHeader.writeUInt32BE(100_000, 4);
  const pngWith = (chunk: Uint8Array) =>
    Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
  cases.push(
    { name: 'png/crc-corruption', probe: pngProbe, bytes: corruptPng, expected: 'INVALID_INPUT' },
    {
      name: 'png/pixel-budget',
      probe: pngProbe,
      bytes: Buffer.concat([png.subarray(0, 8), pngChunk('IHDR', hugeHeader), png.subarray(33)]),
      expected: 'RESOURCE_LIMIT',
    },
    {
      name: 'png/unsupported-animation',
      probe: pngProbe,
      bytes: pngWith(pngChunk('acTL', Buffer.alloc(8))),
      expected: 'UNSUPPORTED_MEDIA',
    },
    {
      name: 'png/empty-chunk-flood',
      probe: pngProbe,
      bytes: pngWith(
        Buffer.concat(Array.from({ length: 32 }, () => pngChunk('tEXt', Buffer.alloc(0)))),
      ),
      expected: 'RESOURCE_LIMIT',
      limits: { maxChunks: 16 },
    },
  );
  const jpeg = fixture('baseline.jpg');
  cases.push(
    {
      name: 'jpeg/empty-segment-flood',
      probe: jpegProbe,
      bytes: Buffer.concat([
        jpeg.subarray(0, 2),
        Buffer.from(Array.from({ length: 32 }, () => [255, 224, 0, 2]).flat()),
        jpeg.subarray(2),
      ]),
      expected: 'RESOURCE_LIMIT',
      limits: { maxChunks: 16 },
    },
    {
      name: 'jpeg/unsupported-process',
      probe: jpegProbe,
      bytes: Buffer.from([255, 216, 255, 195]),
      expected: 'UNSUPPORTED_MEDIA',
    },
    {
      name: 'jpeg/invalid-segment-length',
      probe: jpegProbe,
      bytes: Buffer.from([255, 216, 255, 224, 0, 1]),
      expected: 'INVALID_INPUT',
    },
  );
  const webp = fixture('lossy.webp');
  const extra = (chunks: Uint8Array) => {
    const bytes = Buffer.concat([webp, chunks]);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    return bytes;
  };
  cases.push(
    {
      name: 'webp/empty-chunk-flood',
      probe: webpProbe,
      bytes: extra(Buffer.concat(Array.from({ length: 32 }, () => Buffer.from('zzzz\0\0\0\0')))),
      expected: 'RESOURCE_LIMIT',
      limits: { maxChunks: 16 },
    },
    {
      name: 'webp/unsupported-animation',
      probe: webpProbe,
      bytes: extra(Buffer.from('ANIM\0\0\0\0')),
      expected: 'UNSUPPORTED_MEDIA',
    },
    {
      name: 'webp/truncated-chunk-header',
      probe: webpProbe,
      bytes: extra(Buffer.from([0, 0])),
      expected: 'INVALID_INPUT',
    },
  );
  const gif = fixture('single87.gif');
  gif.write('GIF89a');
  cases.push(
    {
      name: 'gif/empty-comment-flood',
      probe: gifProbe,
      bytes: Buffer.concat([
        gif.subarray(0, 19),
        Buffer.from(Array.from({ length: 32 }, () => [33, 254, 0]).flat()),
        gif.subarray(19),
      ]),
      expected: 'RESOURCE_LIMIT',
      limits: { maxChunks: 16 },
    },
    {
      name: 'gif/multiple-images',
      probe: gifProbe,
      bytes: Buffer.concat([gif.subarray(0, -1), gif.subarray(19)]),
      expected: 'UNSUPPORTED_MEDIA',
    },
    {
      name: 'gif/truncated-subblock',
      probe: gifProbe,
      bytes: Buffer.concat([gif.subarray(0, -1), Buffer.from([33, 254, 255, 0, 59])]),
      expected: 'INVALID_INPUT',
    },
  );
  return cases;
}
