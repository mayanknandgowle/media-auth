import { DEFAULT_LIMITS, MediaAuthError, type MediaProbe } from '@media-auth/core';
import { validateSize } from './limits.js';

function invalid(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

function unsupported(message: string): never {
  throw new MediaAuthError('UNSUPPORTED_MEDIA', message);
}

/** Selected 24-bit BI_RGB headers and extents; no pixel or metadata interpretation. */
export const bmpProbe: MediaProbe = {
  id: 'media-auth.bmp-probe',
  async probe(handle, source, limits = DEFAULT_LIMITS) {
    validateSize(handle.sizeBytes, limits);
    if (typeof handle.read !== 'function') unsupported('BMP probing requires byte-range access.');
    const read = handle.read.bind(handle);
    let blocks = 0;
    function count(): void {
      if (++blocks > limits.maxChunks)
        throw new MediaAuthError('RESOURCE_LIMIT', 'BMP exceeds the block count limit.');
    }
    function payload(length: number): void {
      count();
      if (length > limits.maxChunkBytes)
        throw new MediaAuthError('RESOURCE_LIMIT', 'BMP payload exceeds the byte limit.');
    }
    // Only fixed headers (<= 40 bytes), never pixel/gap lengths or dimensions.
    async function header(offset: number, length: number): Promise<DataView> {
      if (offset > handle.sizeBytes - length) invalid('BMP header is truncated.');
      const bytes = new Uint8Array(length);
      for (let consumed = 0; consumed < length; consumed += limits.maxChunkBytes) {
        const size = Math.min(limits.maxChunkBytes, length - consumed);
        const part = await read(offset + consumed, size);
        if (part.byteLength !== size) invalid('Media adapter returned an incorrect byte range.');
        bytes.set(part, consumed);
      }
      return new DataView(bytes.buffer);
    }

    count();
    const file = await header(0, 14);
    if (file.getUint16(0, true) !== 0x4d42) unsupported('Unsupported BMP signature.');
    if (file.getUint32(2, true) !== handle.sizeBytes)
      invalid('BMP file size does not match input.');
    if (file.getUint16(6, true) !== 0 || file.getUint16(8, true) !== 0)
      invalid('BMP file header has nonzero reserved fields.');
    const pixelOffset = file.getUint32(10, true);
    count();
    if ((await header(14, 4)).getUint32(0, true) !== 40)
      unsupported('Only the 40-byte Windows BMP info header is supported.');
    const info = await header(14, 40);
    if (info.getUint16(12, true) !== 1) invalid('BMP must have one color plane.');
    if (info.getUint16(14, true) !== 24 || info.getUint32(16, true) !== 0)
      unsupported('Only uncompressed 24-bit BI_RGB BMP is supported.');
    if (info.getUint32(32, true) !== 0 || info.getUint32(36, true) !== 0)
      unsupported('BMP color tables and important-color declarations are not supported.');
    const width = info.getInt32(4, true);
    const height = Math.abs(info.getInt32(8, true));
    if (width <= 0 || height === 0) invalid('BMP dimensions must be nonzero with positive width.');
    if (width > limits.maxPixels / height)
      throw new MediaAuthError('RESOURCE_LIMIT', 'BMP dimensions exceed the pixel limit.');
    if (pixelOffset < 54 || pixelOffset > handle.sizeBytes)
      invalid('BMP pixel offset is outside the supported layout.');
    // Avoid 32-bit bitwise stride overflow and unsafe multiplication of large dimensions.
    const stride = Math.ceil((width * 3) / 4) * 4;
    const available = handle.sizeBytes - pixelOffset;
    if (stride > available / height) invalid('BMP padded rows exceed the input extent.');
    const pixelBytes = stride * height;
    if (pixelBytes !== available) invalid('BMP must end at its final padded pixel row.');
    const declaredImageBytes = info.getUint32(20, true);
    if (declaredImageBytes !== 0 && declaredImageBytes !== pixelBytes)
      invalid('BMP image size disagrees with its padded rows.');
    if (pixelOffset > 54) payload(pixelOffset - 54);
    payload(pixelBytes);

    return {
      kind: 'IMAGE',
      mimeType: 'image/bmp',
      sizeBytes: handle.sizeBytes,
      source: { ...source },
      dimensions: { width, height },
      metadataAvailability: 'NOT_PROBED',
      capabilities: [
        'RANGE_READ',
        ...(typeof handle.stream === 'function' ? ['STREAM' as const] : []),
      ],
      limitations: [
        'Only selected 24-bit BI_RGB BMP file/info headers and padded-row extents were checked.',
        'Pixel values, row padding, gap contents, and resolution metadata were not interpreted; full conformance, decodability, and authenticity are not established.',
        'Dimensions are encoded dimensions with positive height for either row order; no pixels were rendered or reoriented.',
      ],
    };
  },
};
