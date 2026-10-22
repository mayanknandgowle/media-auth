# ADR 0010: selected recorded JPEG EXIF fields

Status: accepted for this increment, 2026-10-22.

## Decision

Add `media-auth.jpeg-exif` v0.1.0 to the explicit registry using the existing `MetadataAdapter` boundary. Pure JPEG/TIFF modules live in analyzers; no host APIs, dependencies, permissions or core/fusion changes. CLI `inspect` and both extension acquisition paths share it. CLI `probe` remains descriptor-only; descriptor `metadataAvailability: NOT_PROBED` describes the probe, while separate evidence describes EXIF inspection.

Read one `Exif\0\0` APP1 payload before the first SOS/EOI marker. Support II/MM byte order, TIFF magic 42, primary IFD and one ExifIFD pointer. Record block presence, primary Make/Model/Software/DateTime, orientation SHORT 1..8, and ExifIFD DateTimeOriginal/DateTimeDigitized/LensMake/LensModel. Text is printable ASCII, NUL terminated with optional NUL padding, at most 256 characters. Dates remain strings; orientation never changes dimensions or pixels. Empty strings are omitted; a valid empty directory still establishes block presence.

| Observation                                                                               | Evidence status                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Valid selected fields or empty block                                                      | `DETECTED`, recorded claims only                            |
| No recognized EXIF in pre-scan scope                                                      | `NOT_DETECTED`, explicit scope, no authenticity implication |
| Malformed/ambiguous selected metadata, unsupported known text/type, duplicate blocks/tags | `INCONCLUSIVE`, no partial fields                           |
| Non-JPEG, no range access, I/O failure                                                    | `UNAVAILABLE`, no absence claim                             |
| Budget exhaustion or cancellation                                                         | Propagated typed error, existing core termination policy    |

Do not follow GPS, owner/serial, maker notes, thumbnails, next-IFD or arbitrary directory graphs. Skip unknown tags without dereferencing payloads. Opaque bytes can remain in acquired memory but are not extracted/exported. XMP/IPTC/ICC, Unicode/new TIFF types, post-scan EXIF and full EXIF/JPEG conformance are outside scope. Reject multiple pre-scan EXIF blocks rather than choosing one.

## Bounds and rendering

Validate limits, cancellation and handle size before I/O. Enforce maxBytes and segment payload maxChunkBytes; requests are at most min(4096, maxChunkBytes), checked for exact length and cancellation after each read. A single APP1 payload is smaller than 64 KiB. Markers, fill bytes and entries share maxChunks; at most two nonoverlapping directories of 128 entries each. Validate offsets before reads; reject header/table overlap, cycles, duplicates, wrong known field types/counts, invalid orientation and malformed text. Never allocate from an unbounded TIFF count. Cancellation is cooperative, not a hard timeout.

The extension labels a separate EXIF card and renders textContent. Evidence/JSON exports preserve attribution. Camera/software/dates can be forged or sensitive; no device, editing history, timezone, provenance or authenticity is inferred. Confidence remains unassessed and fusion unchanged.

## Validation and references

Original synthetic endian fixtures preserve baseline JPEG pixels and stay separate from the ten probe-corpus seeds. Tests cover fields/empty/inline text, exact text limits, ambiguity, every truncated APP1 prefix, mutations, read/count/segment budgets, cancellation, clients and safe browser display/export. Independent decoders check fixture pixels/orientation; the report retains encoded dimensions. See the [execution record](../plans/2026-10-22-jpeg-exif-metadata.md).

Primary references: [CIPA standards catalogue](https://www.cipa.jp/e/std/std-sec.html), [CIPA EXIF/XMP field mapping](https://cipa.jp/std/documents/e/DC-X010-2017.pdf), and [LibTIFF specification index](https://libtiff.gitlab.io/libtiff/specification/index.html). This is a limited classic subset, not current full-standard compliance. The mapping supports field identities, not full TIFF framing. Current EXIF download requires publisher acceptance; historical full-spec retrieval was unavailable during this increment. No specification text, third-party parser or external media is redistributed.
