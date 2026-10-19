# ADR 0005: bounded static WebP probing

Status: accepted for this increment, 2026-10-19.

## Context and decision

Phase 1 needs additional deterministic image/container observations. Add `webpProbe` in the host-independent media package and signature dispatch for CLI `probe`/`inspect`. The existing descriptor/evidence contracts suffice; no dependency, permission, or acquisition change is needed. The shared container-dimensions analyzer becomes version 0.3.0. The extension remains on `pngProbe`.

Support simple VP8 and VP8L plus static VP8X containers. Check exact RIFF file extent, padded chunk extents, zero padding, chunk count/payload limits, a single image, selected bitstream headers, nonzero dimensions, pixel limits, reconstruction order, and matching canvas/image dimensions. VP8 is a displayed, unscaled keyframe in versions 0–3 with a bounded nonempty first partition and remaining compressed data. VP8L requires its signature, version zero, and data beyond the dimension header.

VP8X must come first and contain at least its defined ten bytes; reserved bits/bytes and future extra header fields are ignored according to reader rules. ICCP precedes image/alpha reconstruction. EXIF/XMP and unknown chunks may occur out of order after the first header. Metadata presence flags must agree with chunks. This deliberately strict subset rejects duplicate ICCP/EXIF/XMP chunks, even though readers may ignore additional metadata chunks. Unknown chunks are skipped with the same budgets and padding checks.

Separate ALPH requires VP8X, its alpha flag, and subsequent VP8; validate selected coding fields and raw-alpha length. Compressed alpha is skipped. VP8L's alpha-used bit is a hint and is not compared with pixel content or promoted to evidence. No transparency observations are emitted. Animation flags or ANIM/ANMF chunks are rejected, including chunks some general readers may ignore when the flag is absent. Scaled VP8, unsupported versions/coding methods, trailing data, and concatenated files are rejected explicitly. A successful probe is not complete WebP validation.

## Resource and evidence consequences

Validate safe known size and all limits before reads. Each loop consumes a chunk and counts it, including unknown and zero-length chunks. Check payload size and extent before header access or skipping. Read only fixed-size headers and padding, at most 12 bytes per request and no more than `maxChunkBytes`; never allocate from a declared chunk length or pixel count. `maxBytes`, `maxPixels`, `maxChunkBytes`, and `maxChunks` remain client policy. No in-process hard timeout is claimed.

Only recorded encoded dimensions are returned. Metadata remains `NOT_PROBED`, orientation is not applied, compressed streams are not validated/decoded, and decodability/authenticity remain unestablished. Exact hashing still streams all acquired bytes separately. Five deferred analyzers remain `UNAVAILABLE`; fusion remains conservative.

## Validation and deferred scope

Original generated lossy/lossless/alpha fixtures are independently decoded by Chromium. Unit tests exercise malformed containers/headers, truncation, order/flag inconsistencies, unsupported variants, bad range adapters, and resource boundaries; CLI tests check unchanged output/evidence semantics. Browser regression covers the shared analyzer change. See the [execution record](../plans/2026-10-19-webp-probe-cli.md).

Animation, pixel/alpha decoding, metadata extraction, broad compatibility, sustained fuzzing, hard isolation, and extension WebP acquisition are deferred.

## Primary references

- [WebP RIFF container](https://developers.google.com/speed/webp/docs/riff_container)
- [WebP lossless bitstream](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification)
- [VP8, RFC 6386](https://datatracker.ietf.org/doc/html/rfc6386)
