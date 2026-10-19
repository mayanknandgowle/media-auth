import { DEFAULT_LIMITS, MediaAuthError, type MediaProbe } from '@media-auth/core';
import { validateSize } from './limits.js';
import { pngProbe } from './png.js';
import { jpegProbe } from './jpeg.js';
import { webpProbe } from './webp.js';
import { gifProbe } from './gif.js';
import { bmpProbe } from './bmp.js';

/** Explicit byte-signature dispatch; filenames and claimed MIME types are not evidence. */
export const imageProbe: MediaProbe = {
  id: 'media-auth.image-probe',
  async probe(handle, source, limits = DEFAULT_LIMITS) {
    validateSize(handle.sizeBytes, limits);
    if (typeof handle.read !== 'function')
      throw new MediaAuthError('UNSUPPORTED_MEDIA', 'Image probing requires byte-range access.');
    const length = Math.min(12, handle.sizeBytes);
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += limits.maxChunkBytes) {
      const count = Math.min(limits.maxChunkBytes, length - offset);
      const part = await handle.read(offset, count);
      if (part.length !== count) throw new MediaAuthError('INVALID_INPUT', 'Incorrect byte range.');
      bytes.set(part, offset);
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegProbe.probe(handle, source, limits);
    if (bytes[0] === 0x42 && bytes[1] === 0x4d) return bmpProbe.probe(handle, source, limits);
    if (['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.subarray(0, 6))))
      return gifProbe.probe(handle, source, limits);
    if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte))
      return pngProbe.probe(handle, source, limits);
    if (
      String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
    )
      return webpProbe.probe(handle, source, limits);
    throw new MediaAuthError(
      'UNSUPPORTED_MEDIA',
      'Only static PNG/WebP, single-image GIF, 24-bit BI_RGB BMP, and 8-bit baseline/progressive JPEG are supported.',
    );
  },
};
