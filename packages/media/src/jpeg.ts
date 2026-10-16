import {
  DEFAULT_LIMITS,
  MediaAuthError,
  type MediaProbe,
  type ResourceLimits,
} from '@media-auth/core';
import { JpegReader, invalidJpeg as invalid } from './jpeg-reader.js';
import { validateSize } from './limits.js';

interface Component {
  id: number;
  sampling: number;
}
interface Frame {
  width: number;
  height: number;
  progressive: boolean;
  components: Component[];
}

function unsupported(message: string): never {
  throw new MediaAuthError('UNSUPPORTED_MEDIA', message);
}
function word(bytes: Uint8Array, offset = 0): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, false);
}
function frameHeader(bytes: Uint8Array, progressive: boolean, limits: ResourceLimits): Frame {
  const count = bytes[5];
  if (count === undefined || count === 0 || bytes.length !== 6 + 3 * count)
    invalid('JPEG frame header length or component count is invalid.');
  if (bytes[0] !== 8 || count > 4)
    unsupported('Only 8-bit JPEG with up to four components is supported.');
  const height = word(bytes, 1);
  const width = word(bytes, 3);
  if (height === 0) unsupported('Deferred-height JPEG is not supported.');
  if (width === 0) invalid('JPEG width is invalid.');
  if (width > limits.maxPixels / height)
    throw new MediaAuthError('RESOURCE_LIMIT', 'JPEG dimensions exceed the pixel limit.');
  const components: Component[] = [];
  for (let offset = 6; offset < bytes.length; offset += 3) {
    const id = bytes[offset];
    const sampling = bytes[offset + 1];
    const table = bytes[offset + 2];
    if (
      id === undefined ||
      sampling === undefined ||
      table === undefined ||
      table > 3 ||
      sampling >> 4 < 1 ||
      sampling >> 4 > 4 ||
      (sampling & 15) < 1 ||
      (sampling & 15) > 4 ||
      components.some((component) => component.id === id)
    )
      invalid('Invalid JPEG frame component.');
    components.push({ id, sampling });
  }
  return { width, height, progressive, components };
}

function scanHeader(bytes: Uint8Array, frame: Frame, seen: Set<number>): void {
  const count = bytes[0];
  if (
    count === undefined ||
    count < 1 ||
    count > frame.components.length ||
    bytes.length !== 4 + 2 * count
  )
    invalid('JPEG scan header length or component count is invalid.');
  const start = bytes[1 + 2 * count];
  const end = bytes[2 + 2 * count];
  const approximation = bytes[3 + 2 * count];
  if (start === undefined || end === undefined || approximation === undefined)
    invalid('Truncated JPEG scan.');
  if (frame.progressive) {
    const high = approximation >> 4;
    const low = approximation & 15;
    if (
      start > end ||
      end > 63 ||
      (start === 0 && end !== 0) ||
      (start > 0 && count !== 1) ||
      high > 13 ||
      low > 13 ||
      (high !== 0 && high !== low + 1)
    )
      invalid('Invalid progressive JPEG scan parameters.');
  } else if (start !== 0 || end !== 63 || approximation !== 0)
    invalid('Invalid baseline JPEG scan parameters.');
  let previous = -1;
  let blocks = 0;
  for (let i = 0; i < count; i++) {
    const id = bytes[1 + 2 * i];
    const tables = bytes[2 + 2 * i];
    const index = frame.components.findIndex((component) => component.id === id);
    const component = frame.components[index];
    const maxTable = frame.progressive ? 3 : 1;
    if (
      !component ||
      index <= previous ||
      tables === undefined ||
      tables >> 4 > maxTable ||
      (tables & 15) > maxTable ||
      (!frame.progressive && seen.has(component.id))
    )
      invalid('Invalid JPEG scan component.');
    previous = index;
    blocks += (component.sampling >> 4) * (component.sampling & 15);
    if (start === 0) seen.add(component.id);
  }
  if (count > 1 && blocks > 10) invalid('JPEG scan sampling exceeds ten blocks per MCU.');
}

/** Selected T.81 Annex B framing checks only; never decodes entropy or metadata payloads. */
export const jpegProbe: MediaProbe = {
  id: 'media-auth.jpeg-probe',
  async probe(handle, source, limits = DEFAULT_LIMITS) {
    validateSize(handle.sizeBytes, limits);
    const reader = new JpegReader(handle, limits);
    if (handle.sizeBytes < 2) unsupported('Input is not a supported JPEG.');
    const signature = await reader.take(2);
    if (signature[0] !== 0xff || signature[1] !== 0xd8)
      unsupported('Input is not a supported JPEG.');
    let markers = 1;
    let frame: Frame | undefined;
    let entropy = false;
    let restartInterval = 0;
    let restart = 0;
    const seen = new Set<number>();
    while (true) {
      const marker = await reader.marker(entropy);
      if (++markers > limits.maxChunks)
        throw new MediaAuthError('RESOURCE_LIMIT', 'JPEG exceeds the marker count limit.');
      if (marker >= 0xd0 && marker <= 0xd7) {
        if (!entropy || restartInterval === 0 || marker !== 0xd0 + restart)
          invalid('Invalid JPEG restart marker.');
        restart = (restart + 1) % 8;
        continue;
      }
      entropy = false;
      if (marker === 0xd9) {
        if (!frame || seen.size !== frame.components.length || reader.offset !== handle.sizeBytes)
          invalid('JPEG ending, component scans, or trailing data is invalid.');
        return {
          kind: 'IMAGE',
          mimeType: 'image/jpeg',
          sizeBytes: handle.sizeBytes,
          source: { ...source },
          dimensions: { width: frame.width, height: frame.height },
          metadataAvailability: 'NOT_PROBED',
          capabilities: [
            'RANGE_READ',
            ...(typeof handle.stream === 'function' ? ['STREAM' as const] : []),
          ],
          limitations: [
            'Only selected 8-bit baseline/progressive JPEG frame, scan, and marker framing was checked.',
            'Coding tables, entropy data, and metadata payloads were not decoded or validated; full JPEG conformance and decodability are not established.',
            'Dimensions are encoded dimensions; metadata orientation was not applied. A successful probe does not establish authenticity.',
          ],
        };
      }
      if (marker === 0xd8) invalid('JPEG contains a duplicate start marker.');
      if (
        ![0xc0, 0xc2, 0xc4, 0xda, 0xdb, 0xdd, 0xfe].includes(marker) &&
        !(marker >= 0xe0 && marker <= 0xef)
      )
        unsupported('JPEG contains an unsupported process or marker.');
      const length = word(await reader.take(2)) - 2;
      if (length < 0 || length > handle.sizeBytes - reader.offset)
        invalid('JPEG segment length is invalid.');
      if (length > limits.maxChunkBytes)
        throw new MediaAuthError('RESOURCE_LIMIT', 'JPEG segment exceeds the byte limit.');
      if (marker === 0xc0 || marker === 0xc2) {
        if (frame || length < 6) invalid('JPEG requires one complete frame header.');
        if (length > 18) unsupported('JPEG frame has too many components.');
        frame = frameHeader(await reader.take(length), marker === 0xc2, limits);
      } else if (marker === 0xda) {
        if (!frame || length < 6 || length > 12) invalid('JPEG scan is misplaced or invalid.');
        scanHeader(await reader.take(length), frame, seen);
        entropy = true;
        restart = 0;
      } else if (marker === 0xdd) {
        if (length !== 2) invalid('JPEG restart interval length is invalid.');
        restartInterval = word(await reader.take(2));
      } else reader.skip(length);
    }
  },
};
