import { MediaAuthError } from '@media-auth/core';
import { invalidMetadata, type MetadataReader } from './metadata-reader.js';

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const uint32 = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
const textTypes = new Set(['iTXt', 'tEXt', 'zTXt']);
const xmpKeyword = 'XML:com.adobe.xmp';

function updateCrc(state: number, bytes: Uint8Array): number {
  for (const byte of bytes) {
    state ^= byte;
    for (let bit = 0; bit < 8; bit++) state = (state >>> 1) ^ (state & 1 ? 0xedb88320 : 0);
  }
  return state >>> 0;
}

/** Identify only from the bytes being CRC-scanned. Never inflate any text. */
function retainXmp(type: string, first: Uint8Array, length: number): boolean {
  const end = first.subarray(0, 80).indexOf(0);
  if (end < 1 || end > 79) invalidMetadata('PNG text keyword framing is invalid.');
  const name = String.fromCharCode(...first.subarray(0, end));
  if (
    !/^[\x20-\x7e\xa1-\xff]+$/.test(name) ||
    name.startsWith(' ') ||
    name.endsWith(' ') ||
    name.includes('  ')
  )
    invalidMetadata('PNG text keyword is invalid.');
  if (name !== xmpKeyword) return false;
  if (type !== 'iTXt')
    invalidMetadata('Legacy PNG XMP text carriers are outside this reader scope.');
  if (length > 65526)
    throw new MediaAuthError('RESOURCE_LIMIT', 'PNG XMP exceeds project allocation limit.');
  if (length < 22) invalidMetadata('PNG XMP iTXt header is truncated.');
  if (first[18] !== 0)
    invalidMetadata('Compressed or invalid PNG XMP is outside this reader scope.');
  // PNG requires uncompressed decoders to ignore the method byte, even if nonzero.
  if (first[20] !== 0 || first[21] !== 0)
    invalidMetadata('PNG XMP language/translated keyword is outside this reader scope.');
  return true;
}

async function checkChunk(
  reader: MetadataReader,
  type: Uint8Array,
  name: string,
  offset: number,
  length: number,
  format: 'EXIF' | 'XMP',
) {
  const retainExif = format === 'EXIF' && name === 'eXIf';
  if (retainExif && length > 65536)
    throw new MediaAuthError('RESOURCE_LIMIT', 'PNG EXIF exceeds 64 KiB.');
  let captured = retainExif ? new Uint8Array(length) : undefined;
  const text = format === 'XMP' && textTypes.has(name);
  if (text && !length) invalidMetadata('PNG text keyword framing is invalid.');
  let crc = updateCrc(0xffffffff, type);
  for (let i = 0; i < length; i += 4096) {
    reader.consume();
    const part = await reader.range(offset + i, Math.min(4096, length - i));
    crc = updateCrc(crc, part);
    if (text && i === 0 && retainXmp(name, part, length)) captured = new Uint8Array(length);
    captured?.set(part, i);
  }
  const expected = uint32(await reader.range(offset + length, 4));
  if ((crc ^ 0xffffffff) >>> 0 !== expected) invalidMetadata('PNG chunk CRC does not match.');
  return captured;
}

/** Selected static framing and CRC validation; return only retained CRC-checked metadata. */
export async function scanPngMetadata(
  reader: MetadataReader,
  maxChunkBytes: number,
  format: 'EXIF' | 'XMP',
): Promise<Uint8Array | undefined> {
  const start = await reader.range(0, 8);
  if (!signature.every((byte, i) => start[i] === byte)) invalidMetadata('Input is not PNG.');
  let offset = 8;
  let header = false,
    palette = false,
    imageData = false,
    dataEnded = false,
    ended = false;
  let dataBytes = 0;
  let selected: Uint8Array | undefined;
  while (offset < reader.sizeBytes) {
    reader.consume();
    const chunk = await reader.range(offset, 8);
    const length = uint32(chunk);
    if (length > 0x7fffffff) invalidMetadata('PNG chunk length is invalid.');
    const type = String.fromCharCode(...chunk.subarray(4));
    if (length > maxChunkBytes || (format === 'EXIF' && type === 'eXIf' && length > 65536))
      throw new MediaAuthError('RESOURCE_LIMIT', 'PNG metadata chunk exceeds payload budget.');
    if (length > reader.sizeBytes - offset - 12) invalidMetadata('PNG chunk exceeds input.');
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalidMetadata('PNG chunk type is invalid.');
    if (!header && type !== 'IHDR') invalidMetadata('PNG must begin with IHDR.');
    if (['acTL', 'fcTL', 'fdAT'].includes(type))
      invalidMetadata(`Animation is outside this PNG ${format} reader scope.`);
    if (type === 'IHDR') {
      if (header || length !== 13) invalidMetadata('PNG requires one 13-byte IHDR.');
      header = true;
    } else if (type === 'PLTE') {
      if (palette || imageData || !length || length > 768 || length % 3)
        invalidMetadata('PNG palette framing is invalid or misplaced.');
      palette = true;
    } else if (type === 'IDAT') {
      if (dataEnded) invalidMetadata('PNG image chunks must be consecutive.');
      imageData = true;
      dataBytes += length;
    } else if (type === 'IEND') {
      if (length || !imageData || !dataBytes || offset + 12 !== reader.sizeBytes)
        invalidMetadata('PNG ending or image data is invalid.');
      ended = true;
    } else if (type === 'eXIf' && format === 'EXIF') {
      if (selected || imageData) invalidMetadata('PNG requires one eXIf chunk before image data.');
    } else if (type[0] === type[0]?.toUpperCase())
      invalidMetadata(`PNG critical chunk is unsupported by this ${format} reader.`);
    const captured = await checkChunk(reader, chunk.subarray(4), type, offset + 8, length, format);
    if (captured) {
      if (selected) invalidMetadata('Multiple PNG XMP packets are ambiguous.');
      selected = captured;
    }
    if (imageData && type !== 'IDAT') dataEnded = true;
    offset += length + 12;
  }
  if (!header || !ended) invalidMetadata('PNG header or terminal IEND is missing.');
  return selected;
}
