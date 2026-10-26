import { findWebpMetadata } from './webp-metadata.js';
import type { MetadataAdapter } from './contracts.js';
import { metadataReadFailure, openMetadataReader } from './metadata-reader.js';
import { readExifTiff } from './exif-tiff.js';
import { createRecordedMetadataAnalyzer } from './recorded-metadata.js';

const identity = { id: 'media-auth.webp-exif', version: '0.2.0' };
const limitations = [
  'Selected classic TIFF fields from one static WebP EXIF chunk were inspected; this is not full WebP or EXIF conformance validation.',
  'Camera, software, dates and orientation are recorded claims that can be forged; no device, editing history, timezone, provenance or authenticity is inferred.',
  'Printable ASCII only. GPS, owner/serial, maker notes, thumbnails, next-directory graphs and XMP/IPTC/ICC payloads are not inspected.',
  'Dates are unnormalized strings; orientation is not applied to pixels or encoded dimensions. Image/alpha/color-profile reconstruction remains the media probe responsibility.',
];
const fourCC = (bytes: Uint8Array, offset = 0) =>
  String.fromCharCode(...bytes.subarray(offset, offset + 4));
export const webpExifAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openMetadataReader(media, context, 'image/webp', 'WebP', 'EXIF');
    if ('status' in reader) return reader;
    try {
      const exif = await findWebpMetadata(reader, context.limits.maxChunkBytes, 'EXIF');
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
      return metadataReadFailure(error, 'WebP', 'EXIF');
    }
  },
};

export const webpExifAnalyzer = createRecordedMetadataAnalyzer(
  webpExifAdapter,
  'EXIF',
  limitations,
  'No EXIF chunk was found within the static WebP RIFF search scope. This does not establish authenticity.',
);
