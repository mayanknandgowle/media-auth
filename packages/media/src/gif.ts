import { DEFAULT_LIMITS, MediaAuthError, type MediaProbe } from '@media-auth/core';
import { validateSize } from './limits.js';

function invalid(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

function unsupported(message: string): never {
  throw new MediaAuthError('UNSUPPORTED_MEDIA', message);
}

function word(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + (bytes[offset + 1] ?? 0) * 256;
}

/** Single-image framing inspection, not an LZW decoder or a full GIF validator. */
export const gifProbe: MediaProbe = {
  id: 'media-auth.gif-probe',
  async probe(handle, source, limits = DEFAULT_LIMITS) {
    validateSize(handle.sizeBytes, limits);
    if (typeof handle.read !== 'function') unsupported('GIF probing requires byte-range access.');
    const read = handle.read.bind(handle);
    let offset = 0;
    let blocks = 0;
    function count(): void {
      if (++blocks > limits.maxChunks)
        throw new MediaAuthError('RESOURCE_LIMIT', 'GIF exceeds the block count limit.');
    }
    function extent(length: number): void {
      if (length > handle.sizeBytes - offset) invalid('GIF block is truncated.');
    }
    function payloadLimit(length: number): void {
      if (length > limits.maxChunkBytes)
        throw new MediaAuthError('RESOURCE_LIMIT', 'GIF payload exceeds the byte limit.');
    }
    function skip(length: number): void {
      payloadLimit(length);
      extent(length);
      offset += length;
    }
    // Every call uses a fixed header size <= 13, never a declared payload size.
    async function take(length: number): Promise<Uint8Array> {
      extent(length);
      const bytes = new Uint8Array(length);
      for (let consumed = 0; consumed < length; consumed += limits.maxChunkBytes) {
        const size = Math.min(limits.maxChunkBytes, length - consumed);
        const part = await read(offset + consumed, size);
        if (part.byteLength !== size) invalid('Media adapter returned an incorrect byte range.');
        bytes.set(part, consumed);
      }
      offset += length;
      return bytes;
    }
    async function byte(): Promise<number> {
      return (await take(1))[0] ?? 0;
    }
    async function subBlocks(): Promise<number> {
      let total = 0;
      while (true) {
        count(); // Includes zero terminators and every skipped sub-block.
        const length = await byte();
        if (length === 0) return total;
        total += length;
        payloadLimit(total); // Splitting a payload must not bypass its budget.
        skip(length);
      }
    }
    function palette(packed: number): number {
      if (!(packed & 0x80)) return 0;
      count();
      const entries = 2 ** ((packed & 7) + 1);
      skip(entries * 3);
      return entries;
    }

    count(); // Header and logical-screen descriptor form one fixed prefix.
    const header = await take(13);
    const version = String.fromCharCode(...header.subarray(0, 6));
    if (version !== 'GIF87a' && version !== 'GIF89a') unsupported('Unsupported GIF signature.');
    const width = word(header, 6);
    const height = word(header, 8);
    if (width === 0 || height === 0) invalid('GIF canvas dimensions must be nonzero.');
    if (width > limits.maxPixels / height)
      throw new MediaAuthError('RESOURCE_LIMIT', 'GIF canvas exceeds the pixel limit.');
    const packed = header[10] ?? 0;
    if (version === 'GIF87a' && (packed & 8 || header[12] !== 0))
      invalid('GIF87a uses fields reserved for GIF89a.');
    const globalColors = palette(packed);
    if (globalColors && (header[11] ?? 0) >= globalColors)
      invalid('GIF background index exceeds the global color table.');

    let hasImage = false;
    let pendingControl = false;
    let transparentIndex: number | undefined;
    while (true) {
      count();
      const type = await byte();
      if (type === 0x3b) {
        if (!hasImage || pendingControl) invalid('GIF image is missing or control is orphaned.');
        if (offset !== handle.sizeBytes) invalid('GIF trailer must end the input.');
        break;
      }
      if (type === 0x2c) {
        if (hasImage) unsupported('Multiple-image GIF is not supported.');
        const image = await take(9);
        const left = word(image, 0);
        const top = word(image, 2);
        const imageWidth = word(image, 4);
        const imageHeight = word(image, 6);
        if (
          imageWidth === 0 ||
          imageHeight === 0 ||
          left + imageWidth > width ||
          top + imageHeight > height
        )
          invalid('GIF image must fit inside the nonzero canvas.');
        const flags = image[8] ?? 0;
        if (flags & 0x18 || (version === 'GIF87a' && flags & 0x20))
          invalid('GIF image has reserved flags.');
        const colors = palette(flags) || globalColors;
        if (!colors) unsupported('GIF requires an in-file active color table.');
        if (transparentIndex !== undefined && transparentIndex >= colors)
          invalid('GIF transparent index exceeds the active color table.');
        const codeSize = await byte();
        if (codeSize < 2 || codeSize > 8) invalid('GIF LZW minimum code size is invalid.');
        if ((await subBlocks()) === 0) invalid('GIF compressed image data is missing.');
        hasImage = true;
        pendingControl = false;
        transparentIndex = undefined;
      } else if (type === 0x21) {
        if (version !== 'GIF89a') unsupported('GIF extensions require GIF89a.');
        const label = await byte();
        if (label === 0xf9) {
          if (pendingControl) invalid('GIF graphic control is duplicated.');
          count();
          if ((await byte()) !== 4) invalid('GIF graphic control size must be four.');
          payloadLimit(4);
          const control = await take(4);
          const flags = control[0] ?? 0;
          if (flags & 0xe0) invalid('GIF graphic control has reserved flags.');
          if (((flags >>> 2) & 7) > 3 || flags & 2)
            unsupported('GIF disposal method or user-input control is unsupported.');
          transparentIndex = flags & 1 ? control[3] : undefined;
          count();
          if ((await byte()) !== 0) invalid('GIF graphic control terminator is invalid.');
          pendingControl = true;
        } else if (label === 0xfe || label === 0xff) {
          if (label === 0xff) {
            count();
            if ((await byte()) !== 11) invalid('GIF application header size must be eleven.');
            skip(11);
          }
          await subBlocks();
        } else {
          unsupported('GIF plain-text rendering and unknown extensions are not supported.');
        }
      } else {
        invalid('GIF block introducer is invalid.');
      }
    }
    return {
      kind: 'IMAGE',
      mimeType: 'image/gif',
      sizeBytes: handle.sizeBytes,
      source: { ...source },
      dimensions: { width, height },
      metadataAvailability: 'NOT_PROBED',
      capabilities: [
        'RANGE_READ',
        ...(typeof handle.stream === 'function' ? ['STREAM' as const] : []),
      ],
      limitations: [
        'Only selected single-image GIF87a/GIF89a framing and headers were checked.',
        'LZW pixels, palette contents, and metadata payloads were not decoded; decodability and authenticity are not established.',
        'Dimensions describe the logical screen; pixel aspect ratio is not applied. Transparency, timing, looping, and disposal rendering are not verified.',
      ],
    };
  },
};
