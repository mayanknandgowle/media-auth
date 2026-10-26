# ADR 0014: selected recorded JPEG XMP claims

Status: accepted for this increment, 2026-10-26.

## Decision and boundaries

Add `media-auth.jpeg-xmp` v0.1.0 as the eleventh explicitly composed provider. Search JPEG APP1 segments before the first SOS/EOI for one standard NUL-terminated Adobe XMP identifier. Reject a duplicate standard packet, malformed recognized identifier or encountered extended packet; do not choose or merge conflicting payloads. Complete the scoped header walk before parsing/returning fields so later errors discard earlier metadata. Post-scan data is not searched and scoped absence does not establish that all metadata is absent.

Reuse the bounded range reader as `metadata-reader.ts`, the header walk as `jpeg-segments.ts`, and four-state evidence mapping as `recorded-metadata.ts`. EXIF carrier, field, dimension-comparison and error semantics remain intact. The metadata factory adds a numeric dimension comparison only to EXIF. XMP records a separate packet-presence observation plus XMP Basic CreatorTool/CreateDate/ModifyDate/MetadataDate when present. No core, probes, fusion, dependencies, permissions, acquisition or persistence changes.

## Accepted XML/RDF subset

Decode UTF-8 strictly using standard TextDecoder in supported Node/Chromium runtimes, at the analyzer adapter boundary. The small XML reader uses no DOM, filesystem, network, external entity loader or third-party parser. It is a deliberately rejecting subset, not a general-purpose XML/XMP validator. Names are ASCII QNames; values can contain valid Unicode XML characters. Normalize literal XML line endings/attribute whitespace; preserve decoded field values and date strings without timestamp validation or timezone conversion.

Accept an RDF graph directly or inside one xmpmeta wrapper, optional strict XML 1.0/UTF-8 declaration and paired standard xpacket instructions. Resolve scoped namespace URIs, including aliases/default element namespaces, and reject unbound/reserved bindings and duplicate expanded attributes. Require rdf:Description with empty rdf:about. Selected direct properties can be attributes or text-only child elements; reject duplicate selected properties, child structures and qualifiers instead of guessing. Unknown bounded properties are not extracted; selected-looking descendants inside them do not become observations. Reject unsupported subject/qualifier attributes and HasExtendedXMP declarations on the inspected descriptions.

Allow only five predefined entities and bounded numeric character references with valid XML code points. Decode once, without recursive expansion. Reject DTD/entity declarations, comments, CDATA, arbitrary processing instructions, malformed syntax/UTF-8 and unsupported wrappers/qualifiers. Valid documents outside the subset are inconclusive, not falsely described as having no XMP. URLs used as namespaces or opaque values are never fetched. Packet presence/claims do not verify editing history, creator, device, origin, provenance or authenticity; no EXIF/XMP reconciliation or final-verdict change.

## Resource and evidence policy

The standard JPEG packet is at most 65,504 XML bytes (65,533 APP1 data bytes minus 29 identifier bytes). Input, segment payload and work budgets apply before allocation/read. Range requests are at most min(4096,maxChunkBytes), with exact lengths and cancellation before/after I/O. Markers/fill/XML tags/attributes/text share maxChunks. Additional hard bounds: depth 8, nodes 128, attributes 16 per element, namespace bindings 32, names 128 characters, namespace URIs 256 characters, attribute values 2048 units, packet instructions 256 units and selected fields 256 UTF-16 units. Claimed values never control image allocation. These are cooperative bounds, not a process sandbox or peak-memory guarantee.

Supported packet/fields are DETECTED recorded evidence, scoped absence NOT_DETECTED, malformed/ambiguous/unsupported data INCONCLUSIVE with no partial fields, and wrong MIME/missing ranges/I/O UNAVAILABLE. Cancellation/resource errors propagate. Confidence remains unassessed; evidence quality is partial. Extension cards render literal source-specific text and deliberate JSON exports include selected claims, which may be sensitive or forged.

## Validation and primary references

Two original JPEG fixtures retain original pixels and EXIF while adding attribute/element XMP variants, namespace aliases, Unicode/references, distinct raw date strings and an opaque nested spoof property that is ignored. Tests cover carrier/packet ambiguity and truncations, XML/namespace/entity adversarial cases, hard/work/read/allocation/cancellation limits, availability, independent EXIF/hash, clients and export. Chromium checks decoded pixels; supplemental host ElementTree independently verifies all four direct claims and Pillow checks encoded pixels. These do not establish general XMP/JPEG conformance. See [execution record](../plans/2026-10-26-jpeg-xmp-metadata.md).

References: [Adobe XMP specification overview](https://developer.adobe.com/xmp/docs/xmp-specifications/), [XMP Basic namespace](https://developer.adobe.com/xmp/docs/xmp-namespaces/xmp/), [Adobe JPEG handler signature definitions](https://github.com/adobe/XMP-Toolkit-SDK/blob/main/XMPFiles/source/FileHandlers/JPEG_Handler.cpp), [W3C XML](https://www.w3.org/TR/xml/) and [XML namespaces](https://www.w3.org/TR/xml-names/). The publisher PDF link was accessible but raw PDF extraction was unavailable through the web tool; identifiers were independently checked in Adobe's source. No third-party code, specification text or external media is redistributed.
