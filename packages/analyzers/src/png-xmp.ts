import type { MetadataAdapter } from './contracts.js';
import { openMetadataReader, metadataReadFailure } from './metadata-reader.js';
import { scanPngMetadata } from './png-metadata.js';
import { readXmpPacket } from './xmp-packet.js';
import { createRecordedMetadataAnalyzer } from './recorded-metadata.js';

const identity = { id: 'media-auth.png-xmp', version: '0.1.0' };
const limitations = [
  'One uncompressed static PNG iTXt XMP packet and a limited UTF-8 XML/RDF scalar subset were inspected; this is not full PNG, XML, RDF or XMP conformance validation. CRC is not authenticity.',
  'CreatorTool and date strings are recorded claims, not verified editing history, capture time, device, provenance or authenticity. Dates remain unnormalized; orientation is not applied.',
  'Project caps are 65,526 selected chunk bytes and 65,504 packet bytes. Compressed/legacy XMP carriers, nonempty language/translated headers and animation are inconclusive when encountered; no text/pixels are decompressed. Uncompressed compression-method bytes are ignored.',
  'Only XMP Basic CreatorTool/CreateDate/ModifyDate/MetadataDate are extracted. Unknown text/properties, author/GPS/title/history and linked resources are not extracted or fetched. No EXIF/XMP reconciliation. Complete image-header/palette/color semantics remain the probe responsibility.',
];
export const pngXmpAdapter: MetadataAdapter = {
  identity,
  async read(media, context) {
    const reader = openMetadataReader(media, context, 'image/png', 'PNG', 'XMP');
    if ('status' in reader) return reader;
    try {
      const payload = await scanPngMetadata(reader, context.limits.maxChunkBytes, 'XMP');
      if (!payload)
        return {
          status: 'NOT_DETECTED',
          scope:
            'Exact XML:com.adobe.xmp keywords in iTXt/tEXt/zTXt across the CRC-checked static PNG datastream through terminal IEND only; other carriers and embedded payloads were not searched.',
        };
      return {
        status: 'DETECTED',
        observations: readXmpPacket(payload.subarray(22), reader.consume),
        limitations,
      };
    } catch (error) {
      return metadataReadFailure(error, 'PNG', 'XMP');
    }
  },
};
export const pngXmpAnalyzer = createRecordedMetadataAnalyzer(
  pngXmpAdapter,
  'XMP',
  limitations,
  'No recognized XMP text keyword was found within the static PNG search scope. This does not establish authenticity.',
);
