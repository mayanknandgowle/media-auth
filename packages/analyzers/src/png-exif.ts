import { MediaAuthError } from '@media-auth/core';
import type { MetadataAdapter } from './contracts.js';
import { exifReadFailure, openExifReader, type ExifReader } from './exif-reader.js';
import { invalidExif, readExifTiff } from './exif-tiff.js';
import { createRecordedExifAnalyzer } from './recorded-exif.js';

const identity = { id: 'media-auth.png-exif', version: '0.1.0' };
const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const limitations = [
  'Selected static PNG framing, chunk CRCs and classic TIFF fields were checked; this is not full PNG or EXIF conformance validation.',
  'EXIF fields are recorded claims that may be forged or historical. No device, editing history, timezone, provenance or authenticity is inferred; CRC is not cryptographic identity.',
  'Printable ASCII only. GPS, owner/serial, maker notes, thumbnails, next-directory graphs, XMP/IPTC/ICC and text payloads are not extracted.',
  'Dates remain unnormalized strings and orientation is not applied to encoded dimensions or pixels. Complete image-header/palette/color semantics remain the probe responsibility; pixels are not decompressed.',
];
const uint32 = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);

// Small private CRC primitive: keep metadata independent of probe internals/host APIs.
function updateCrc(state: number, bytes: Uint8Array): number {
  for (const byte of bytes) {
    state ^= byte;
    for (let bit = 0; bit < 8; bit++) state = (state >>> 1) ^ (state & 1 ? 0xedb88320 : 0);
  }
  return state >>> 0;
}

async function checkChunk(
  reader: ExifReader,
  type: Uint8Array,
  offset: number,
  length: number,
  retain: boolean,
) {
  if (retain && length > 65536)
    throw new MediaAuthError('RESOURCE_LIMIT', 'PNG EXIF exceeds 64 KiB.');
  const captured = retain ? new Uint8Array(length) : undefined;
  let crc = updateCrc(0xffffffff, type);
  for (let i = 0; i < length; i += 4096) {
    reader.consume();
    const part = await reader.range(offset + i, Math.min(4096, length - i));
    crc = updateCrc(crc, part);
    captured?.set(part, i);
  }
  const expected = uint32(await reader.range(offset + length, 4));
  if ((crc ^ 0xffffffff) >>> 0 !== expected) invalidExif('PNG chunk CRC does not match.');
  return captured;
}

export const pngExifAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openExifReader(media, context, 'image/png', 'PNG');
    if ('status' in reader) return reader;
    try {
      const start = await reader.range(0, 8);
      if (!signature.every((byte, i) => start[i] === byte)) invalidExif('Input is not PNG.');
      let offset = 8;
      let header = false;
      let palette = false;
      let imageData = false;
      let dataEnded = false;
      let dataBytes = 0;
      let ended = false;
      let exif: Uint8Array | undefined;
      while (offset < reader.sizeBytes) {
        reader.consume();
        const chunk = await reader.range(offset, 8);
        const length = uint32(chunk);
        if (length > 0x7fffffff) invalidExif('PNG chunk length is invalid.');
        const type = String.fromCharCode(...chunk.subarray(4));
        if (length > context.limits.maxChunkBytes || (type === 'eXIf' && length > 65536))
          throw new MediaAuthError('RESOURCE_LIMIT', 'PNG metadata chunk exceeds payload budget.');
        if (length > reader.sizeBytes - offset - 12) invalidExif('PNG chunk exceeds input.');
        if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) invalidExif('PNG chunk type is invalid.');
        if (!header && type !== 'IHDR') invalidExif('PNG must begin with IHDR.');
        if (['acTL', 'fcTL', 'fdAT'].includes(type))
          invalidExif('Animation is outside this PNG EXIF reader scope.');
        if (type === 'IHDR') {
          if (header || length !== 13) invalidExif('PNG requires one 13-byte IHDR.');
          header = true;
        } else if (type === 'PLTE') {
          if (palette || imageData || !length || length > 768 || length % 3)
            invalidExif('PNG palette framing is invalid or misplaced.');
          palette = true;
        } else if (type === 'IDAT') {
          if (dataEnded) invalidExif('PNG image chunks must be consecutive.');
          imageData = true;
          dataBytes += length;
        } else if (type === 'IEND') {
          if (length || !imageData || !dataBytes || offset + 12 !== reader.sizeBytes)
            invalidExif('PNG ending or image data is invalid.');
          ended = true;
        } else if (type === 'eXIf') {
          if (exif || imageData) invalidExif('PNG requires one eXIf chunk before image data.');
        } else if (type[0] === type[0]?.toUpperCase())
          invalidExif('PNG critical chunk is unsupported by this EXIF reader.');
        const captured = await checkChunk(
          reader,
          chunk.subarray(4),
          offset + 8,
          length,
          type === 'eXIf',
        );
        if (captured) exif = captured;
        if (imageData && type !== 'IDAT') dataEnded = true;
        offset += length + 12;
      }
      if (!header || !ended) invalidExif('PNG header or terminal IEND is missing.');
      if (!exif)
        return {
          status: 'NOT_DETECTED',
          scope:
            'eXIf chunk identifiers across the CRC-checked static PNG datastream through terminal IEND only; other metadata formats were not searched.',
        };
      return { status: 'DETECTED', observations: readExifTiff(exif, reader.consume), limitations };
    } catch (error) {
      return exifReadFailure(error, 'PNG');
    }
  },
};

export const pngExifAnalyzer = createRecordedExifAnalyzer(
  pngExifAdapter,
  limitations,
  'No eXIf chunk was found within the static PNG search scope. This does not establish authenticity.',
);
