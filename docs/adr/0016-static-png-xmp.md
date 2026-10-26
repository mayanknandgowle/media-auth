# ADR 0016: selected recorded uncompressed PNG XMP

Status: accepted for this increment, 2026-10-26.

## Decision and scope

Add `media-auth.png-xmp` v0.1.0 as the thirteenth explicit provider. Accept one iTXt with exact case-sensitive `XML:com.adobe.xmp`, compression flag zero, empty language tag/translated keyword and the existing limited UTF-8 XML/RDF scalar subset. PNG decoders must ignore the compression-method byte for uncompressed text; this adapter follows that rule, including nonzero values. No JPEG identifier or EXIF compatibility prefix is accepted. Metadata can appear before or after contiguous IDAT, through terminal IEND.

Recognized XMP in compressed iTXt or legacy tEXt/zTXt is INCONCLUSIVE, without invoking an inflater. Unknown text values remain opaque and are not extracted/decompressed. The XMP search checks bounded text-keyword framing (1–79 printable Latin-1 bytes with PNG space restrictions); malformed keyword framing is inconclusive. Exact longer/differently cased keywords are unrelated. Duplicate selected packets are ambiguous, even though general PNG text permits repeated keywords. This does not claim general PNG/text/XMP conformance.

## Shared scanner and bounds

Extract static PNG framing/CRC scanning from the EXIF adapter into `png-metadata.ts`. Preserve EXIF pre-IDAT/duplicate semantics, limits, diagnostics, 4 KiB CRC-block work accounting and retained-byte behavior. Each adapter independently scans selected framing, all chunk CRCs and its own format; broader image header/palette/color/pixel checks stay with the media probe. Animation, unsupported critical chunks, nonconsecutive IDAT, truncated/invalid endings and late CRC failures discard selected metadata. CRC checks accidental corruption, not authenticity.

Identify XMP keywords from the first CRC block and retain only recognized iTXt bytes; no separate prefix read or metadata reread. Cap selected chunk allocation at 65,526 bytes, including its 22-byte header, before allocating retention. Identification can read the first bounded 4 KiB block before this cap is applied. XML packet remains capped at 65,504 bytes. Unknown payloads are CRC-scanned in bounded blocks without full retention. Input/chunk/work limits and cooperative cancellation apply independently, along with ADR 0014's unchanged XML depth/node/attribute/namespace/field caps. These are project policies, not format maxima or process isolation guarantees.

Finish complete scoped framing/CRC scanning before field interpretation and use only retained CRC-checked bytes. The reader never resolves external entities/URLs. A matching unsupported header or XML produces no partial XMP fields. Supported packet presence/scalars are DETECTED, scoped absence NOT_DETECTED, malformed/unsupported/ambiguous data INCONCLUSIVE, wrong MIME/missing byte access/I/O UNAVAILABLE; resource/cancellation errors propagate.

## Evidence and clients

Packet presence and creator-tool/creation/modification/metadata dates are forgeable recorded claims, separate from EXIF/hash. Preserve raw date values, encoded dimensions and unassessed confidence. No XMP dimension comparison, normalization/reconciliation, editing-history/provenance/authenticity inference or fusion change. CLI and extension compose the same registry; a source-specific PNG XMP card uses literal text. Deliberate JSON exports may contain sensitive claims. No dependencies, permissions, acquisition, persistence, core or media-probe changes.

## Validation and references

Two original Apache-2.0 fixtures preserve EXIF and pixels and carry attribute/pre-IDAT and element/post-IDAT variants. Carrier/CRC/retained-byte/header/compression/keyword/duplicate/error/resource/cancellation tests supplement the unchanged XML adversarial suite. CLI/browser/export and independent pixel decoding cover both fixtures. Executed results and limits are in the [execution record](../plans/2026-10-26-png-xmp-metadata.md).

Primary references: [W3C PNG third edition text/iTXt rules](https://www.w3.org/TR/png-3/#11iTXt) and [Adobe canonical PNG XMP header definitions](https://github.com/adobe/XMP-Toolkit-SDK/blob/main/XMPFiles/source/FormatSupport/PNG_Support.hpp). Existing XML/RDF subset decisions remain in [ADR 0014](0014-bounded-jpeg-xmp.md). No external source code, specification text or media is redistributed. Bounded cross-runtime decompression remains a distinct future design.
