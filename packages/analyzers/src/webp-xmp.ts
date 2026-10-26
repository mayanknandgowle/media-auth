import type { MetadataAdapter } from './contracts.js';
import { openMetadataReader, metadataReadFailure } from './metadata-reader.js';
import { findWebpMetadata } from './webp-metadata.js';
import { readXmpPacket } from './xmp-packet.js';
import { createRecordedMetadataAnalyzer } from './recorded-metadata.js';

const identity = { id: 'media-auth.webp-xmp', version: '0.1.0' };
const limitations = [
  'One static WebP XMP chunk and a limited UTF-8 XML/RDF scalar subset were inspected; this is not full WebP, XML, RDF or XMP conformance validation.',
  'CreatorTool and date strings are recorded claims, not verified editing history, capture time, device, provenance or authenticity. Dates remain unnormalized.',
  'A project inspection cap of 65,504 packet bytes applies; it is not a WebP format limit. Animation, selected-field arrays/qualifiers, extended declarations, XML comments/CDATA/DTD and arbitrary processing instructions are unsupported.',
  'Only XMP Basic CreatorTool/CreateDate/ModifyDate/MetadataDate are extracted. Unknown properties, author/GPS/title/history and linked resources are not extracted or fetched. No EXIF/XMP reconciliation is performed. Image/alpha/color-profile reconstruction remains the media probe responsibility.',
];
export const webpXmpAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openMetadataReader(media, context, 'image/webp', 'WebP', 'XMP');
    if ('status' in reader) return reader;
    try {
      const packet = await findWebpMetadata(reader, context.limits.maxChunkBytes, 'XMP');
      if (!packet)
        return {
          status: 'NOT_DETECTED',
          scope:
            'XMP FourCC chunks across the exact static WebP RIFF extent only; other metadata formats and embedded payloads were not searched.',
        };
      const observations = readXmpPacket(
        await reader.range(packet.offset, packet.length),
        reader.consume,
      );
      return { status: 'DETECTED', observations, limitations };
    } catch (error) {
      return metadataReadFailure(error, 'WebP', 'XMP');
    }
  },
};
export const webpXmpAnalyzer = createRecordedMetadataAnalyzer(
  webpXmpAdapter,
  'XMP',
  limitations,
  'No XMP chunk was found in the static WebP RIFF search scope. This does not establish authenticity.',
);
