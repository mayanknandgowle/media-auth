import { MediaAuthError } from '@media-auth/core';
import type { MetadataAdapter, MetadataReadResult } from './contracts.js';
import { invalidExif, readExifTiff } from './exif-tiff.js';
import { openExifReader, exifReadFailure } from './exif-reader.js';
import { createRecordedExifAnalyzer } from './recorded-exif.js';

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
    const reader = openExifReader(media, context, 'image/jpeg', 'JPEG');
    if ('status' in reader) return reader;
    const { range, consume, sizeBytes } = reader;
    try {
      const signature = await range(0, 2);
      if (signature[0] !== 255 || signature[1] !== 216)
        invalidExif('Input is not a JPEG SOI stream.');
      let offset = 2;
      let exif: { offset: number; length: number } | undefined;
      while (true) {
        consume();
        const prefix = await range(offset, 2);
        if (prefix[0] !== 255) invalidExif('JPEG metadata marker is invalid.');
        offset += 2;
        let code = prefix[1];
        while (code === 255) {
          consume();
          code = (await range(offset++, 1))[0];
        }
        if (code === 0xda || code === 0xd9) break;
        if (code === 1) continue;
        if (code === undefined || code === 0 || code === 0xd8 || (code >= 0xd0 && code <= 0xd7))
          invalidExif('Unexpected JPEG marker before scan.');
        const size = await range(offset, 2);
        const length = (size[0] ?? 0) * 256 + (size[1] ?? 0);
        if (length < 2 || offset > sizeBytes - length)
          invalidExif('JPEG metadata segment extends beyond input.');
        const payload = length - 2;
        if (payload > context.limits.maxChunkBytes)
          throw new MediaAuthError(
            'RESOURCE_LIMIT',
            'JPEG metadata segment exceeds payload budget.',
          );
        if (code === 0xe1) {
          const id = await range(offset + 2, Math.min(6, payload));
          if (String.fromCharCode(...id.subarray(0, 4)) === 'Exif') {
            if (id.length !== 6 || id[4] !== 0 || id[5] !== 0)
              invalidExif('EXIF APP1 identifier is malformed.');
            if (exif) invalidExif('Multiple EXIF APP1 blocks are ambiguous.');
            exif = { offset: offset + 8, length: payload - 6 };
          }
        }
        offset += length;
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
      return exifReadFailure(error, 'JPEG');
    }
  },
};

export const jpegExifAnalyzer = createRecordedExifAnalyzer(
  jpegExifAdapter,
  limitations,
  'No recognized EXIF APP1 block was found within the pre-scan search scope. This does not establish authenticity.',
);
