import { scanPngMetadata } from './png-metadata.js';
import type { MetadataAdapter } from './contracts.js';
import { metadataReadFailure, openMetadataReader } from './metadata-reader.js';
import { readExifTiff } from './exif-tiff.js';
import { createRecordedMetadataAnalyzer } from './recorded-metadata.js';

const identity = { id: 'media-auth.png-exif', version: '0.2.0' };
const limitations = [
  'Selected static PNG framing, chunk CRCs and classic TIFF fields were checked; this is not full PNG or EXIF conformance validation.',
  'EXIF fields are recorded claims that may be forged or historical. No device, editing history, timezone, provenance or authenticity is inferred; CRC is not cryptographic identity.',
  'Printable ASCII only. GPS, owner/serial, maker notes, thumbnails, next-directory graphs, XMP/IPTC/ICC and text payloads are not extracted.',
  'Dates remain unnormalized strings and orientation is not applied to encoded dimensions or pixels. Complete image-header/palette/color semantics remain the probe responsibility; pixels are not decompressed.',
];
export const pngExifAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openMetadataReader(media, context, 'image/png', 'PNG', 'EXIF');
    if ('status' in reader) return reader;
    try {
      const exif = await scanPngMetadata(reader, context.limits.maxChunkBytes, 'EXIF');
      if (!exif)
        return {
          status: 'NOT_DETECTED',
          scope:
            'eXIf chunk identifiers across the CRC-checked static PNG datastream through terminal IEND only; other metadata formats were not searched.',
        };
      return { status: 'DETECTED', observations: readExifTiff(exif, reader.consume), limitations };
    } catch (error) {
      return metadataReadFailure(error, 'PNG', 'EXIF');
    }
  },
};

export const pngExifAnalyzer = createRecordedMetadataAnalyzer(
  pngExifAdapter,
  'EXIF',
  limitations,
  'No eXIf chunk was found within the static PNG search scope. This does not establish authenticity.',
);
