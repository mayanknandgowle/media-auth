# ADR 0006: bounded single-image GIF probing

Status: accepted for this increment, 2026-10-19.

## Context and decision

Extend Phase 1 local CLI probing with GIF87a/GIF89a framing inspection. `gifProbe` belongs to the host-independent media package; `imageProbe` dispatches by bytes. Existing core contracts and local-file protections suffice. The container-dimensions analyzer becomes version 0.4.0. The extension still calls `pngProbe` and acquires no new formats or permissions.

The accepted subset contains exactly one image, with a global or local in-file color table. Report logical-screen dimensions, which can exceed the image rectangle; require nonzero dimensions and an image wholly inside that screen. Apply the pixel budget to the screen, which also bounds the contained image. Support interlaced image headers without decoding their rows. Check palette extents and background/declared transparent indices against their applicable tables. Inactive palette/index fields are ignored.

GIF89a graphic control permits disposal values 0–3, with no user-input requirement. Reject reserved fields, duplicate pending controls, orphan controls, and invalid fixed sizes/terminators. Comments and application extensions can intervene before the image without consuming pending graphic control. Their bounded contents are skipped. Application identifiers, timing/looping semantics, palette colors, and metadata are not interpreted. In particular, accepting a single-image file with an application extension is not a statement that its display timing or looping was evaluated.

Validate the LZW minimum code-size range and nonempty, terminated image-data framing, but never inspect or expand compressed codes. An exact trailer is required. Multiple images, plain-text rendering, unknown extension labels, missing in-file palettes, unsupported versions, and trailing/concatenated files are rejected. GIF87a cannot use GIF89a extension/sort/aspect fields. This conservative subset intentionally excludes some streams a general decoder may accept, including palette-only streams and streams relying on a previous palette. It is not full GIF conformance.

## Resource accounting

Validate known safe size and positive safe-integer limits before I/O. All allocations are fixed header buffers of at most 13 bytes; requests are further split by `maxChunkBytes`. Palette, compressed-image, comment, and application payloads are skipped after extent/budget checks. No allocation depends on declared dimensions or payload length.

`maxChunks` counts the combined header/logical-screen prefix, each color table, each top-level image/extension/trailer, and each sub-block including zero terminators. The image header includes its minimum-code-size byte. Graphic control's fixed payload and terminator count separately; the application's fixed header also counts separately. `single87.gif` consumes eleven units. This deliberately counts tiny/empty extensions and prevents an unbounded read loop.

`maxChunkBytes` bounds each palette and fixed extension payload/header, each individual sub-block, and the aggregate payload of each image/comment/application sub-block chain. Splitting a payload does not bypass its limit. The application identifier header has its own bound; its data chain is counted separately. `maxBytes` bounds the entire file. These are operation/allocation bounds for the parser, not a hard timeout for an arbitrary asynchronous adapter.

## Evidence and privacy

Only encoded logical-screen dimensions become recorded evidence. Metadata remains `NOT_PROBED`; pixel aspect ratio is not applied. Transparency, display timing, looping, disposal rendering, decodability, provenance, and authenticity are not established. Hashing remains a separate complete-byte operation. Five deferred analyzers remain unavailable and fusion remains conservative. No new dependency, remote access, retention, or permission is introduced.

## Validation and deferred scope

Original GIF87a and transparent/interlaced GIF89a fixtures use explicit palette pixels and simple deterministic LZW construction. Chromium independently checks every decoded RGBA pixel. Unit tests exercise all fixture truncations, structural mutations, unsupported rendering, exact budgets, range contracts, and skipped payloads. CLI checks retain descriptor-only probing and conservative deterministic analysis. Shared-analyzer browser regression remains required. See the [execution record](../plans/2026-10-19-gif-probe-cli.md).

Full LZW validation, animation/temporal analysis, arbitrary extension semantics, sustained fuzzing, isolated decoders, metadata intelligence, and extension GIF acquisition remain deferred.

## Primary reference

[CompuServe GIF89a specification, hosted by W3C](https://www.w3.org/Graphics/GIF/spec-gif89a.txt), especially sections 15–27 and Appendix F. The implementation and fixture generator are original code, not copied decoder code. See [format attribution](../../THIRD_PARTY_NOTICES.md).
