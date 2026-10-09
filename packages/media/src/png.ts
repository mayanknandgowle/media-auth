import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type MediaDescriptor,
  type MediaHandle,
  type MediaProbe,
  type MediaSource,
  type ResourceLimits,
} from '@media-auth/core';
import { validateSize } from './limits.js';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const READ_BYTES = 64 * 1024;

function invalid(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

async function read(handle: MediaHandle, offset: number, length: number): Promise<Uint8Array> {
  if (typeof handle.read !== 'function')
    throw new MediaAuthError('UNSUPPORTED_MEDIA', 'The PNG probe requires byte-range access.');
  if (offset > handle.sizeBytes - length) invalid('PNG data is truncated.');
  const bytes = await handle.read(offset, length);
  if (bytes.byteLength !== length) invalid('Media adapter returned an incomplete byte range.');
  return bytes;
}

function uint32(bytes: Uint8Array, offset = 0): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

// PNG's CRC32 detects damaged chunk bytes; it is NOT a cryptographic identity.
// Format reference: https://www.w3.org/TR/png/#5CRC-algorithm
function crcUpdate(crc: number, bytes: Uint8Array): number {
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return crc;
}

async function verifyChecksum(handle: MediaHandle, offset: number, length: number): Promise<void> {
  let crc = 0xffffffff;
  for (let consumed = 0; consumed < length; consumed += READ_BYTES) {
    crc = crcUpdate(
      crc,
      await read(handle, offset + consumed, Math.min(READ_BYTES, length - consumed)),
    );
  }
  const expected = uint32(await read(handle, offset + length, 4));
  if ((crc ^ 0xffffffff) >>> 0 !== expected) invalid('PNG chunk checksum does not match.');
}

interface Header {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

function parseHeader(bytes: Uint8Array, limits: ResourceLimits): Header {
  const width = uint32(bytes);
  const height = uint32(bytes, 4);
  const bitDepth = bytes[8];
  const colorType = bytes[9];
  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff)
    invalid('PNG dimensions are invalid.');
  if (width > limits.maxPixels / height)
    throw new MediaAuthError('RESOURCE_LIMIT', 'PNG dimensions exceed the pixel limit.');
  const depths: Readonly<Record<number, readonly number[]>> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (colorType === undefined || bitDepth === undefined || !depths[colorType]?.includes(bitDepth))
    invalid('PNG color type and bit depth are invalid.');
  if (bytes[10] !== 0 || bytes[11] !== 0 || (bytes[12] !== 0 && bytes[12] !== 1))
    invalid('PNG compression, filter, or interlace method is invalid.');
  return { width, height, bitDepth, colorType };
}

/** Bounded static PNG container probe. Never decompresses or interprets pixel/metadata payloads. */
export const pngProbe: MediaProbe = {
  id: 'media-auth.png-probe',
  async probe(
    handle: MediaHandle,
    source: MediaSource,
    limits: ResourceLimits = DEFAULT_LIMITS,
  ): Promise<MediaDescriptor> {
    validateSize(handle.sizeBytes, limits);
    if (handle.sizeBytes < SIGNATURE.length)
      throw new MediaAuthError('UNSUPPORTED_MEDIA', 'Input is not a supported PNG.');
    const signature = await read(handle, 0, SIGNATURE.length);
    if (!SIGNATURE.every((byte, index) => signature[index] === byte))
      throw new MediaAuthError(
        'UNSUPPORTED_MEDIA',
        'Only static PNG containers are supported in this milestone.',
      );
    let header: Header | undefined;
    let offset = 8;
    let chunks = 0;
    let palette = false;
    let imageData = false;
    let imageDataEnded = false;
    let imageDataBytes = 0;
    let ended = false;
    while (offset < handle.sizeBytes) {
      if (++chunks > limits.maxChunks)
        throw new MediaAuthError('RESOURCE_LIMIT', 'PNG exceeds the chunk count limit.');
      const chunkHeader = await read(handle, offset, 8);
      const length = uint32(chunkHeader);
      if (length > 0x7fffffff) invalid('PNG chunk length is invalid.');
      if (length > limits.maxChunkBytes)
        throw new MediaAuthError('RESOURCE_LIMIT', 'PNG chunk exceeds the chunk byte limit.');
      if (length > handle.sizeBytes - offset - 12) invalid('PNG chunk extends beyond the input.');
      const type = String.fromCharCode(...chunkHeader.subarray(4));
      if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalid('PNG chunk type is invalid.');
      if (!header && type !== 'IHDR') invalid('PNG must begin with IHDR.');
      if (['acTL', 'fcTL', 'fdAT'].includes(type))
        throw new MediaAuthError(
          'UNSUPPORTED_MEDIA',
          'Animated PNG is not supported by the static PNG probe.',
        );
      if (type === 'IHDR') {
        if (header || length !== 13) invalid('PNG requires exactly one 13-byte IHDR.');
        header = parseHeader(await read(handle, offset + 8, length), limits);
      } else if (type === 'PLTE') {
        if (
          !header ||
          palette ||
          imageData ||
          length === 0 ||
          length % 3 !== 0 ||
          length > 768 ||
          header.colorType === 0 ||
          header.colorType === 4 ||
          (header.colorType === 3 && length / 3 > 2 ** header.bitDepth)
        )
          invalid('PNG palette is invalid or misplaced.');
        palette = true;
      } else if (type === 'IDAT') {
        if (imageDataEnded || (header?.colorType === 3 && !palette))
          invalid('PNG image data is misplaced or lacks its palette.');
        imageData = true;
        imageDataBytes += length;
      } else if (type === 'IEND') {
        if (length !== 0 || !imageData || imageDataBytes === 0 || offset + 12 !== handle.sizeBytes)
          invalid('PNG ending or image data is invalid.');
        ended = true;
      } else if (type[0] === type[0]?.toUpperCase()) {
        throw new MediaAuthError(
          'UNSUPPORTED_MEDIA',
          'PNG contains an unsupported critical chunk.',
        );
      }
      if (imageData && type !== 'IDAT') imageDataEnded = true;
      await verifyChecksum(handle, offset + 4, length + 4);
      offset += length + 12;
    }
    if (!header || !ended) invalid('PNG is missing its header or ending.');
    return {
      kind: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: handle.sizeBytes,
      source: { ...source },
      dimensions: { width: header.width, height: header.height },
      metadataAvailability: 'NOT_PROBED',
      capabilities: [
        'RANGE_READ',
        ...(typeof handle.stream === 'function' ? ['STREAM' as const] : []),
      ],
      limitations: [
        'Only static PNG framing, critical chunk order, header fields, and chunk checksums were checked.',
        'Pixel data and metadata payloads were not decoded; a successful probe does not establish image decodability or authenticity.',
      ],
    };
  },
};
