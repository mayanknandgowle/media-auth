import { MediaAuthError } from '@media-auth/core';
import { invalidMetadata, type MetadataReader } from './metadata-reader.js';

const fourCC = (bytes: Uint8Array, offset = 0) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));
const uint32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

/** Complete static RIFF scan before exposing the selected payload; image decoding is separate. */
export async function findWebpMetadata(
  reader: MetadataReader,
  maxChunkBytes: number,
  format: 'EXIF' | 'XMP',
): Promise<{ offset: number; length: number } | undefined> {
  const tag = format === 'EXIF' ? 'EXIF' : 'XMP ';
  const mask = format === 'EXIF' ? 8 : 4;
  const cap = format === 'EXIF' ? 65536 : 65504;
  const header = await reader.range(0, 12);
  if (fourCC(header) !== 'RIFF' || fourCC(header, 8) !== 'WEBP')
    invalidMetadata('Input is not RIFF WebP.');
  const size = uint32(header, 4);
  if (size % 2 || size > 0xfffffff6 || size + 8 !== reader.sizeBytes)
    invalidMetadata('WebP RIFF extent must exactly match input.');
  let offset = 12;
  let first = true;
  let flags: number | undefined;
  let image = false;
  let selected: { offset: number; length: number } | undefined;
  while (offset < reader.sizeBytes) {
    reader.consume();
    const chunk = await reader.range(offset, 8);
    const type = fourCC(chunk);
    const length = uint32(chunk, 4);
    if (length > maxChunkBytes || (type === tag && length > cap))
      throw new MediaAuthError('RESOURCE_LIMIT', 'WebP metadata chunk exceeds payload budget.');
    const padded = length + (length % 2);
    if (padded > reader.sizeBytes - offset - 8) invalidMetadata('WebP chunk extends beyond RIFF.');
    const payload = offset + 8;
    if (length % 2 && (await reader.range(payload + length, 1))[0] !== 0)
      invalidMetadata('WebP padding must be zero.');
    if (first && !['VP8X', 'VP8 ', 'VP8L'].includes(type))
      invalidMetadata('WebP first chunk is unsupported.');
    if (type === 'ANIM' || type === 'ANMF')
      invalidMetadata(`Animated WebP is outside this ${format} reader scope.`);
    if (type === 'VP8X') {
      if (!first || length < 10) invalidMetadata('WebP extended header is misplaced or truncated.');
      flags = (await reader.range(payload, 1))[0] ?? 0;
      if (flags & 2) invalidMetadata(`Animated WebP is outside this ${format} reader scope.`);
    } else if (type === 'VP8 ' || type === 'VP8L') {
      if (image || !length) invalidMetadata('Static WebP requires one nonempty image chunk.');
      image = true;
    } else if (type === tag) {
      if (selected || flags === undefined)
        invalidMetadata(`WebP ${format} requires an extended header and one unique chunk.`);
      selected = { offset: payload, length };
    }
    first = false;
    offset += 8 + padded;
  }
  if (!image) invalidMetadata('WebP image chunk is missing.');
  if (flags !== undefined && Boolean(flags & mask) !== Boolean(selected))
    invalidMetadata(`WebP ${format} flag and chunk disagree.`);
  return selected;
}
