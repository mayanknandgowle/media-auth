import type { MetadataAdapter } from './contracts.js';
import { invalidMetadata, openMetadataReader, metadataReadFailure } from './metadata-reader.js';
import { jpegHeaderSegments } from './jpeg-segments.js';
import { readXmpPacket } from './xmp-packet.js';
import { createRecordedMetadataAnalyzer } from './recorded-metadata.js';

const identity = { id: 'media-auth.jpeg-xmp', version: '0.1.0' };
const identifier = 'http://ns.adobe.com/xap/1.0/';
const extended = 'http://ns.adobe.com/xmp/extension/';
const limitations = [
  'One standard pre-scan JPEG XMP packet and a limited UTF-8 XML/RDF scalar subset were inspected; this is not full JPEG, XML, RDF or XMP conformance validation.',
  'CreatorTool and date strings are recorded claims, not verified editing history, capture time, device, provenance or authenticity. Dates remain unnormalized.',
  'Extended packets, selected-field arrays/qualifiers, XML comments/CDATA/DTD and arbitrary processing instructions are inconclusive when encountered within scope. Post-scan metadata and other carriers are not searched.',
  'Only XMP Basic CreatorTool/CreateDate/ModifyDate/MetadataDate are extracted. Unknown properties, author/GPS/title/history and linked resources are not extracted or fetched. No EXIF/XMP reconciliation is performed.',
];
export const jpegXmpAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openMetadataReader(media, context, 'image/jpeg', 'JPEG', 'XMP');
    if ('status' in reader) return reader;
    try {
      let packet: { offset: number; length: number } | undefined;
      for await (const segment of jpegHeaderSegments(reader, context.limits.maxChunkBytes)) {
        if (segment.marker !== 0xe1) continue;
        const header = String.fromCharCode(
          ...(await reader.range(segment.offset, Math.min(35, segment.length))),
        );
        if (header.startsWith(extended))
          invalidMetadata('Extended JPEG XMP is outside this reader scope.');
        if (header.startsWith(identifier)) {
          if (header[identifier.length] !== '\0')
            invalidMetadata('JPEG XMP identifier is malformed.');
          if (packet) invalidMetadata('Multiple standard JPEG XMP packets are ambiguous.');
          packet = {
            offset: segment.offset + identifier.length + 1,
            length: segment.length - identifier.length - 1,
          };
        }
      }
      if (!packet)
        return {
          status: 'NOT_DETECTED',
          scope:
            'Recognized standard/extended XMP APP1 identifiers before the first JPEG SOS/EOI marker only; later packets and other metadata formats were not searched.',
        };
      const observations = readXmpPacket(
        await reader.range(packet.offset, packet.length),
        reader.consume,
      );
      return { status: 'DETECTED', observations, limitations };
    } catch (error) {
      return metadataReadFailure(error, 'JPEG', 'XMP');
    }
  },
};
export const jpegXmpAnalyzer = createRecordedMetadataAnalyzer(
  jpegXmpAdapter,
  'XMP',
  limitations,
  'No recognized XMP APP1 packet was found in the pre-scan search scope. This does not establish authenticity.',
);
