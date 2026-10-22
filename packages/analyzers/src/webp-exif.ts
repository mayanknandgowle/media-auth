import { MediaAuthError } from '@media-auth/core';
import type { MetadataAdapter } from './contracts.js';
import { exifReadFailure, openExifReader } from './exif-reader.js';
import { invalidExif, readExifTiff } from './exif-tiff.js';
import { createRecordedExifAnalyzer } from './recorded-exif.js';

const identity = { id: 'media-auth.webp-exif', version: '0.1.0' };
const limitations = [
  'Selected classic TIFF fields from one static WebP EXIF chunk were inspected; this is not full WebP or EXIF conformance validation.',
  'Camera, software, dates and orientation are recorded claims that can be forged; no device, editing history, timezone, provenance or authenticity is inferred.',
  'Printable ASCII only. GPS, owner/serial, maker notes, thumbnails, next-directory graphs and XMP/IPTC/ICC payloads are not inspected.',
  'Dates are unnormalized strings; orientation is not applied to pixels or encoded dimensions. Image/alpha/color-profile reconstruction remains the media probe responsibility.',
];
const fourCC = (bytes: Uint8Array, offset = 0) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));
const uint32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);

export const webpExifAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openExifReader(media, context, 'image/webp', 'WebP');
    if ('status' in reader) return reader;
    try {
      const header = await reader.range(0, 12);
      if (fourCC(header) !== 'RIFF' || fourCC(header, 8) !== 'WEBP')
        invalidExif('Input is not RIFF WebP.');
      const size = uint32(header, 4);
      if (size % 2 || size > 0xfffffff6 || size + 8 !== reader.sizeBytes)
        invalidExif('WebP RIFF extent must exactly match input.');
      let offset = 12;
      let first = true;
      let flags: number | undefined;
      let image = false;
      let exif: { offset: number; length: number } | undefined;
      while (offset < reader.sizeBytes) {
        reader.consume();
        const chunk = await reader.range(offset, 8);
        const type = fourCC(chunk);
        const length = uint32(chunk, 4);
        if (length > context.limits.maxChunkBytes || (type === 'EXIF' && length > 65536))
          throw new MediaAuthError('RESOURCE_LIMIT', 'WebP metadata chunk exceeds payload budget.');
        const padded = length + (length % 2);
        if (padded > reader.sizeBytes - offset - 8) invalidExif('WebP chunk extends beyond RIFF.');
        const payload = offset + 8;
        if (length % 2 && (await reader.range(payload + length, 1))[0] !== 0)
          invalidExif('WebP padding must be zero.');
        if (first && !['VP8X', 'VP8 ', 'VP8L'].includes(type))
          invalidExif('WebP first chunk is unsupported.');
        if (type === 'ANIM' || type === 'ANMF')
          invalidExif('Animated WebP is outside this EXIF reader scope.');
        if (type === 'VP8X') {
          if (!first || length < 10) invalidExif('WebP extended header is misplaced or truncated.');
          flags = (await reader.range(payload, 1))[0] ?? 0;
          if (flags & 2) invalidExif('Animated WebP is outside this EXIF reader scope.');
        } else if (type === 'VP8 ' || type === 'VP8L') {
          if (image || !length) invalidExif('Static WebP requires one nonempty image chunk.');
          image = true;
        } else if (type === 'EXIF') {
          if (exif || flags === undefined)
            invalidExif('WebP EXIF requires an extended header and one unique chunk.');
          exif = { offset: payload, length };
        }
        first = false;
        offset += 8 + padded;
      }
      if (!image) invalidExif('WebP image chunk is missing.');
      if (flags !== undefined && Boolean(flags & 8) !== Boolean(exif))
        invalidExif('WebP EXIF flag and chunk disagree.');
      if (!exif)
        return {
          status: 'NOT_DETECTED',
          scope:
            'EXIF FourCC chunks across the exact static WebP RIFF extent only; other metadata formats and embedded payloads were not searched.',
        };
      const bytes = await reader.range(exif.offset, exif.length);
      const prefix =
        bytes.length >= 6 && fourCC(bytes) === 'Exif' && bytes[4] === 0 && bytes[5] === 0;
      const observations = readExifTiff(prefix ? bytes.subarray(6) : bytes, reader.consume);
      return {
        status: 'DETECTED',
        observations,
        limitations: prefix
          ? [
              ...limitations,
              'One nonstandard Exif NUL NUL payload prefix was accepted for compatibility; standard conformance is not established.',
            ]
          : limitations,
      };
    } catch (error) {
      return exifReadFailure(error, 'WebP');
    }
  },
};

export const webpExifAnalyzer = createRecordedExifAnalyzer(
  webpExifAdapter,
  limitations,
  'No EXIF chunk was found within the static WebP RIFF search scope. This does not establish authenticity.',
);
