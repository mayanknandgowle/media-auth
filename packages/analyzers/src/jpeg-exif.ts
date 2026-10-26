import type { MetadataAdapter, MetadataReadResult } from './contracts.js';
import { invalidExif, readExifTiff } from './exif-tiff.js';
import { openMetadataReader, metadataReadFailure } from './metadata-reader.js';
import { jpegHeaderSegments } from './jpeg-segments.js';
import { createRecordedMetadataAnalyzer } from './recorded-metadata.js';

const identity = { id: 'media-auth.jpeg-exif', version: '0.2.0' };
const limitations = [
  'Selected classic TIFF fields from one EXIF APP1 block before the first JPEG scan were inspected; this is not full EXIF conformance validation.',
  'Camera, software, dates and orientation are recorded claims that can be forged; no device, editing history, timezone, provenance or authenticity is inferred.',
  'Printable ASCII text only. GPS, owner/serial data, maker notes, thumbnails, next-directory graphs, XMP/IPTC/ICC and post-scan metadata are not inspected.',
  'Dates are unnormalized recorded strings and orientation is not applied to pixels or encoded dimensions.',
];

export const jpegExifAdapter: MetadataAdapter = {
  identity,
  async read(media, context): Promise<MetadataReadResult> {
    const reader = openMetadataReader(media, context, 'image/jpeg', 'JPEG', 'EXIF');
    if ('status' in reader) return reader;
    const { range, consume } = reader;
    try {
      let exif: { offset: number; length: number } | undefined;
      for await (const segment of jpegHeaderSegments(reader, context.limits.maxChunkBytes)) {
        if (segment.marker === 0xe1) {
          const id = await range(segment.offset, Math.min(6, segment.length));
          if (String.fromCharCode(...id.subarray(0, 4)) === 'Exif') {
            if (id.length !== 6 || id[4] !== 0 || id[5] !== 0)
              invalidExif('EXIF APP1 identifier is malformed.');
            if (exif) invalidExif('Multiple EXIF APP1 blocks are ambiguous.');
            exif = { offset: segment.offset + 6, length: segment.length - 6 };
          }
        }
      }
      if (!exif)
        return {
          status: 'NOT_DETECTED',
          scope:
            'Recognized EXIF APP1 identifiers in JPEG headers before the first SOS/EOI marker only; later metadata and other formats were not searched.',
        };
      const observations = readExifTiff(await range(exif.offset, exif.length), consume);
      return { status: 'DETECTED', observations, limitations };
    } catch (error) {
      return metadataReadFailure(error, 'JPEG', 'EXIF');
    }
  },
};

export const jpegExifAnalyzer = createRecordedMetadataAnalyzer(
  jpegExifAdapter,
  'EXIF',
  limitations,
  'No recognized EXIF APP1 block was found within the pre-scan search scope. This does not establish authenticity.',
);
