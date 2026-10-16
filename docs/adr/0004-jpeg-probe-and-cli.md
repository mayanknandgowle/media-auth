# ADR 0004: Bounded JPEG probing and descriptor-only CLI output

Status: Accepted — 2026-10-16

## Context

The foundation has a static PNG probe and local-file CLI. The first media-probing increment needs a useful additional image format without adding a decoder, broad metadata parser, or browser permissions. JPEG permits multiple processes and complex coding semantics; dimensions alone cannot establish decodability or authenticity.

## Decision

Add a host-independent JPEG probe and explicit PNG/JPEG byte-signature dispatch in `packages/media`. Support one 8-bit baseline or progressive Huffman frame with up to four components. Check selected segment/frame/scan structure, component identifiers, dimensions, stuffing, restart sequence, and exact ending. Reject other processes, deferred height, and trailing/concatenated streams. Skip coding tables and application payloads without interpreting them. Full progressive scan progression, coding table semantics, entropy validity, and restart MCU intervals are not validated.

Use forward buffered reads of at most 64 KiB, capped further by `maxChunkBytes`. Enforce `maxBytes`, `maxPixels`, per-segment payload and entropy-interval byte limits, and `maxChunks` as a marker count including start, end, and restart markers. Marker fill bytes are bounded by total input size. Never allocate from a declared segment length; only bounded frame/scan headers are copied. No decompression, native media parser, or new dependency is introduced.

CLI `probe` returns `{schemaVersion, media}` without analyzers, hashes, or conclusions. CLI `inspect` dispatches from bytes and composes existing recorded-dimension and exact-identity analyzers. Report encoded dimensions without applying EXIF orientation. Metadata remains `NOT_PROBED`; advanced analyzers remain `UNAVAILABLE`, and baseline fusion remains conservative. The metadata adapter version becomes 0.2.0 because its supported format scope changes.

The extension continues calling `pngProbe` explicitly. ADR 0003's browser acquisition and permission decisions remain unchanged; only its CLI format scope is extended.

## Consequences and validation

JPEG success means selected framing checks passed, not that the image is decodable or authentic. Generated baseline and progressive fixtures use original constant-gray pixels and are independently decoded with Chromium. Tests exercise malformed/truncated structures, byte access contracts, resource budgets, dispatch, and all CLI entry forms. The browser regression protects the shared analyzer change without claiming native toolbar integration was retested.

WebP, video/audio, EXIF/XMP/IPTC/ICC, orientation correction, complete JPEG validation, isolation, and parser fuzzing remain future work.

Reference: [ITU-T T.81, Annexes B and F](https://www.w3.org/Graphics/JPEG/itu-t81.pdf).
