# ADR 0012: recorded EXIF in static PNG

Status: accepted for this increment, 2026-10-22.

## Decision

Add `media-auth.png-exif` v0.1.0 to the explicit registry (ten analyzers). Reuse bounded byte access, selected classic TIFF fields and recorded evidence mapping. JPEG/WebP provider semantics and versions, core/media/fusion, acquisition, dependencies and permissions remain unchanged. The descriptor-only probe keeps `NOT_PROBED`; subsequent EXIF observations are separate evidence.

The PNG metadata adapter independently walks selected static chunk framing and checks every CRC. It retains at most one 64 KiB eXIf payload from the same reads used for checksum calculation, then parses those retained bytes only after the complete carrier succeeds. This avoids parsing different unchecked bytes after a CRC pass. Unknown/image data are scanned in small blocks without whole-payload allocation or decompression. The small private CRC primitive keeps analyzers independent of probe internals; Node's built-in CRC32 supplies an independent fixture/test oracle. No new utility package or dependency is warranted.

## Scope and resource policy

Require the PNG signature, first/unique 13-byte IHDR, bounded valid chunk names/extents, selected palette framing/order, consecutive nonempty-total IDAT and final zero-length IEND. Reject excluded animation/unknown critical chunks, duplicates and any CRC mismatch. Require a single raw-TIFF eXIf before IDAT; JPEG-style prefixes and post-IDAT eXIf are inconclusive. Complete image-header/color/palette semantics remain the probe's responsibility, and no general decodability or conformance claim follows.

Input and declared payload limits apply before reads/allocation. Range requests are at most min(4096, maxChunkBytes). Chunks, CRC payload blocks and TIFF entries share maxChunks; every read checks cooperative cancellation. TIFF directories, entry counts and printable-ASCII text retain existing bounds. No GPS/owner/serial, maker notes, thumbnails, next-directory graphs, XMP/IPTC/ICC/text content or pixels are interpreted. CRC checks corruption, never identity/authenticity.

Detected blocks/selected fields are recorded claims, possibly forged or historical. No eXIf in the declared CRC-checked scope is `NOT_DETECTED`; malformed/ambiguous/excluded data is `INCONCLUSIVE` without partial observations; other MIME/missing range/I/O is `UNAVAILABLE`; budget/cancellation errors propagate. Dates stay raw strings and orientation never changes MediaAuth dimensions. Render a separate PNG EXIF card as text and disclose fields in deliberate JSON exports. No inference or provenance verification is added.

## Validation and reference

Two original 16 × 8 flat-gray RGBA PNG fixtures contain synthetic II/MM TIFF fields before IDAT, independent of the ten probe-corpus seeds. Tests cover CRCs including later-chunk failure, retained-byte integrity, prefix/order/duplicate errors, all truncated inputs, work/allocation/read limits, cancellation and clients. Chromium observes orientation 6 as an 8 × 16 view; independent Pillow checks all nine recorded fields and encoded pixels. The report remains 16 × 8. Decoder behavior is not metadata truth. See the [execution record](../plans/2026-10-22-png-exif-metadata.md).

Primary reference: [W3C PNG Third Edition](https://www.w3.org/TR/png-3/), sections 5.5, 5.6 and 11.3.4.5. This is a narrow adapter implementation, not complete PNG/EXIF standard validation. No specification text or external parser is redistributed.
