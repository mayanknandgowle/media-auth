import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type MediaHandle,
  type MediaProbe,
  type ResourceLimits,
} from '@media-auth/core';
import { validateSize } from './limits.js';

function invalid(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

function unsupported(message: string): never {
  throw new MediaAuthError('UNSUPPORTED_MEDIA', message);
}

function uint(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let i = length - 1; i >= 0; i--) value = value * 256 + (bytes[offset + i] ?? 0);
  return value;
}

function fourCC(bytes: Uint8Array, offset = 0): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

// Only fixed-size headers/padding are read, never an allocation based on a chunk length.
async function read(
  handle: MediaHandle,
  offset: number,
  length: number,
  limits: ResourceLimits,
): Promise<Uint8Array> {
  if (typeof handle.read !== 'function') unsupported('WebP probing requires byte-range access.');
  if (offset > handle.sizeBytes - length) invalid('WebP header is truncated.');
  const bytes = new Uint8Array(length);
  for (let consumed = 0; consumed < length; consumed += limits.maxChunkBytes) {
    const count = Math.min(limits.maxChunkBytes, length - consumed);
    const part = await handle.read(offset + consumed, count);
    if (part.byteLength !== count) invalid('Media adapter returned an incorrect byte range.');
    bytes.set(part, consumed);
  }
  return bytes;
}

interface Dimensions {
  width: number;
  height: number;
}

function dimensions(width: number, height: number, limits: ResourceLimits): Dimensions {
  if (width === 0 || height === 0) invalid('WebP dimensions must be nonzero.');
  if (width > 0xffffffff / height) invalid('WebP canvas exceeds the format pixel limit.');
  if (width > limits.maxPixels / height)
    throw new MediaAuthError('RESOURCE_LIMIT', 'WebP dimensions exceed the pixel limit.');
  return { width, height };
}

async function imageHeader(
  handle: MediaHandle,
  offset: number,
  length: number,
  type: string,
  limits: ResourceLimits,
): Promise<Dimensions> {
  if (type === 'VP8L') {
    if (length <= 5) invalid('WebP lossless header or image data is missing.');
    const header = await read(handle, offset, 5, limits);
    if (header[0] !== 0x2f) invalid('WebP lossless signature is invalid.');
    const bits = uint(header, 1, 4);
    if (bits >>> 29 !== 0) unsupported('WebP lossless version is unsupported.');
    // The alpha-used bit is only a hint, not a verified transparency observation.
    return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, limits);
  }
  if (length <= 10) invalid('WebP VP8 header or image data is missing.');
  const header = await read(handle, offset, 10, limits);
  const tag = uint(header, 0, 3);
  if ((tag & 1) !== 0 || uint(header, 3, 3) !== 0x2a019d)
    invalid('WebP requires a VP8 key frame with its start code.');
  if (((tag >>> 1) & 7) > 3) unsupported('WebP VP8 version is unsupported.');
  if ((tag & 16) === 0) invalid('WebP VP8 frame is not displayable.');
  const partition = tag >>> 5;
  if (partition === 0 || partition >= length - 10)
    invalid('WebP VP8 first partition extent is invalid.');
  const width = uint(header, 6, 2);
  const height = uint(header, 8, 2);
  if (width >>> 14 !== 0 || height >>> 14 !== 0)
    unsupported('Scaled VP8 frames are not supported by this WebP probe.');
  return dimensions(width, height, limits);
}

/** Selected static RIFF/header checks only; no compressed pixels or metadata are decoded. */
export const webpProbe: MediaProbe = {
  id: 'media-auth.webp-probe',
  async probe(handle, source, limits = DEFAULT_LIMITS) {
    validateSize(handle.sizeBytes, limits);
    if (handle.sizeBytes < 12) unsupported('Input is not a supported WebP container.');
    const header = await read(handle, 0, 12, limits);
    if (fourCC(header) !== 'RIFF' || fourCC(header, 8) !== 'WEBP')
      unsupported('Input is not a supported WebP container.');
    const size = uint(header, 4, 4);
    if (size % 2 !== 0 || size > 0xfffffff6 || size + 8 !== handle.sizeBytes)
      invalid('WebP RIFF extent must exactly match the input.');

    let offset = 12;
    let chunks = 0;
    let flags: number | undefined;
    let canvas: Dimensions | undefined;
    let image: Dimensions | undefined;
    let alpha = false;
    const metadata = new Set<string>();
    while (offset < handle.sizeBytes) {
      if (++chunks > limits.maxChunks)
        throw new MediaAuthError('RESOURCE_LIMIT', 'WebP exceeds the chunk count limit.');
      const chunk = await read(handle, offset, 8, limits);
      const type = fourCC(chunk);
      const length = uint(chunk, 4, 4);
      if (length > limits.maxChunkBytes)
        throw new MediaAuthError('RESOURCE_LIMIT', 'WebP chunk exceeds the byte limit.');
      const padded = length + (length % 2);
      if (padded > handle.sizeBytes - offset - 8) invalid('WebP chunk exceeds the RIFF extent.');
      const payload = offset + 8;
      if (length % 2 && (await read(handle, payload + length, 1, limits))[0] !== 0)
        invalid('WebP chunk padding must be zero.');
      if (chunks === 1 && !['VP8X', 'VP8 ', 'VP8L'].includes(type))
        invalid('WebP must begin with an image or extended header.');
      if (type === 'ANIM' || type === 'ANMF') unsupported('Animated WebP is not supported.');

      if (type === 'VP8X') {
        if (chunks !== 1 || length < 10) invalid('WebP extended header is invalid or misplaced.');
        const extended = await read(handle, payload, 10, limits);
        flags = extended[0] ?? 0;
        if (flags & 2) unsupported('Animated WebP is not supported.');
        // Reader rules require ignoring reserved bits and future extended-header fields.
        canvas = dimensions(uint(extended, 4, 3) + 1, uint(extended, 7, 3) + 1, limits);
      } else if (type === 'VP8 ' || type === 'VP8L') {
        if (image) invalid('Static WebP must contain exactly one image.');
        if (type === 'VP8L' && alpha)
          invalid('WebP lossless image cannot use a separate alpha chunk.');
        image = await imageHeader(handle, payload, length, type, limits);
        if (canvas && (canvas.width !== image.width || canvas.height !== image.height))
          invalid('WebP canvas and image dimensions disagree.');
        if (type === 'VP8 ' && flags !== undefined && Boolean(flags & 16) !== alpha)
          invalid('WebP alpha flag and alpha chunk disagree.');
      } else if (type === 'ALPH') {
        if (flags === undefined || !(flags & 16) || !canvas || alpha || image || length < 2)
          invalid('WebP alpha chunk is invalid or misplaced.');
        const control = (await read(handle, payload, 1, limits))[0] ?? 0;
        const compression = control & 3;
        if (compression > 1 || ((control >>> 4) & 3) > 1)
          unsupported('WebP alpha coding method is unsupported.');
        if (compression === 0 && length - 1 !== canvas.width * canvas.height)
          invalid('WebP raw alpha extent does not match the canvas.');
        alpha = true;
      } else if (['ICCP', 'EXIF', 'XMP '].includes(type)) {
        if (flags === undefined || metadata.has(type))
          invalid('WebP metadata requires an extended header and unique chunks.');
        if (type === 'ICCP' && (alpha || image)) invalid('WebP color profile is misplaced.');
        metadata.add(type);
      }
      // Unknown chunks are skipped; their extent, padding, and budgets are still checked.
      offset += 8 + padded;
    }
    if (!image) invalid('WebP image data is missing.');
    if (flags !== undefined) {
      for (const [type, mask] of [
        ['ICCP', 32],
        ['EXIF', 8],
        ['XMP ', 4],
      ] as const)
        if (Boolean(flags & mask) !== metadata.has(type))
          invalid('WebP metadata flags and chunks disagree.');
    }
    return {
      kind: 'IMAGE',
      mimeType: 'image/webp',
      sizeBytes: handle.sizeBytes,
      source: { ...source },
      dimensions: image,
      metadataAvailability: 'NOT_PROBED',
      capabilities: [
        'RANGE_READ',
        ...(typeof handle.stream === 'function' ? ['STREAM' as const] : []),
      ],
      limitations: [
        'Only selected static WebP RIFF framing, reconstruction order, and image headers were checked.',
        'Compressed pixels, alpha data, and metadata payloads were not decoded; decodability and authenticity are not established.',
        'Dimensions are encoded dimensions; metadata orientation is not applied. Transparency hints are not verified.',
      ],
    };
  },
};
