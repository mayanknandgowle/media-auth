# ADR 0011: recorded EXIF in static WebP

Status: accepted for this increment, 2026-10-22.

## Decision and boundaries

Add `media-auth.webp-exif` v0.1.0 as an independent analyzer, retaining the JPEG provider identity (now v0.1.1). The explicit registry has nine analyzers. Share bounded byte access (`exif-reader.ts`), selected classic TIFF parsing (`exif-tiff.ts`) and evidence mapping (`recorded-exif.ts`). Keep carrier scanners separate and host-independent in analyzers. No core/media/fusion, dependency, permission, network or acquisition change.

WebP metadata inspection independently checks RIFF/WEBP signature, exact even RIFF extent, every chunk extent/payload budget, zero odd-byte padding, first/unique extended header, one nonempty static image chunk, no animation and EXIF flag/presence agreement. Unknown chunks are skipped with bounds. Reject duplicate EXIF/image chunks and misplaced headers before reading EXIF payload. Metadata may occur before or after the image in an extended container. Pixel coding, dimensions, alpha/profile reconstruction and complete WebP validation remain the probe's responsibility. This adapter cannot establish decodability or complete container conformance.

Allocate one EXIF chunk at most 64 KiB after scanning the carrier. Range requests are at most min(4096, maxChunkBytes), exact-length checked and cooperatively cancellable before/after I/O. Carrier chunks and TIFF entries share maxChunks. Input/payload limits, two-directory/128-entry bounds and 256-character ASCII fields remain independent. Unknown TIFF payloads, next-directory graphs, GPS/owner/serial, maker notes and thumbnails are not dereferenced. The common reader also validates range arithmetic before allocation; JPEG remains limited by APP1's smaller format extent.

## Evidence and compatibility

Use the existing recorded camera/lens, software, dates, orientation and block-presence subset from [ADR 0010](0010-bounded-jpeg-exif.md). Dates are strings; orientation is never applied to MediaAuth dimensions or pixels. No authenticity, device, editing-history, timezone or provenance inference. Present a source-specific WebP EXIF card using textContent; deliberate JSON exports preserve attribution and may disclose sensitive recorded fields.

Valid fields/block are `DETECTED`. No EXIF FourCC across the exact static RIFF extent is `NOT_DETECTED` with explicit scope, never authenticity. Ambiguous/malformed carrier or selected TIFF data (including excluded animation) is `INCONCLUSIVE` without partial fields. Other MIME types/missing range access/I/O are `UNAVAILABLE`. Budget/cancellation errors propagate through existing core termination policy.

Raw classic TIFF is the supported standard payload. Accept one exact `Exif\0\0` prefix as a compatibility form, with an extra limitation; reject repeated or malformed prefixes. This is not a claim that prefixed data conforms to the standard.

## Evidence and references

Two original raw-TIFF II/MM fixtures reuse original lossless WebP image bytes and original synthetic JPEG TIFF fields. They do not alter the probe-corpus seeds or JPEG fixtures. Tests cover malformed framing/flags/padding, every prefix, duplicates, unknown chunks, payload ordering, compatibility, TIFF errors, exact allocation/read limits and cancellation, plus CLI/browser display/export. Chromium 156.0.8078.4 decodes the raw-TIFF fixtures at 16 × 8 without applying orientation 6; Pillow 12.3.0 separately verifies all nine recorded fields and encoded pixels. Neither decoder behavior nor recorded EXIF establishes authenticity. See the [execution record](../plans/2026-10-22-webp-exif-metadata.md).

Primary references: [Google WebP container specification](https://developers.google.com/speed/webp/docs/riff_container) for RIFF/chunks/padding/flags and [ExifTool RIFF implementation](https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/RIFF.pm) for observed prefixed compatibility. Installed Pillow's reader corroborates raw/prefixed payload handling. No third-party implementation or specification text is copied or redistributed.
