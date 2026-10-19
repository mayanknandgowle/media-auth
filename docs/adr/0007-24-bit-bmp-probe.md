# ADR 0007: bounded 24-bit BMP probing

Status: accepted for this increment, 2026-10-19.

## Decision and accepted subset

Add pure `bmpProbe` and byte-signature CLI dispatch. Accept `BM` files with a 40-byte Windows BITMAPINFOHEADER, one plane, 24-bit BI_RGB data, and no color-table or important-color declaration. Both top-down and bottom-up storage yield positive encoded dimensions. The shared recorded-dimensions analyzer becomes version 0.5.0; existing core contracts and acquisition adapters suffice. The extension remains PNG-only.

Check the declared file size against the known input, zero file-header reserved fields, positive width/nonzero signed height, pixel budget, nonoverlapping pixel offset, padded-row extent, and declared image size (zero or matching the computed extent). Require the last padded row to end exactly at EOF. Permit a bounded opaque gap between the headers and pixel array. Resolution fields, gap contents, row padding, and pixel values are not interpreted.

Other DIB header versions, indexed/16/32-bit images, bitfields, compressed RLE, embedded JPEG/PNG, and optional optimization palettes are deliberately unsupported. Even a 24-bit file with a color table is outside this subset. No complete BMP validator, renderer, or color-management implementation is claimed.

## Bounds and arithmetic

Validate known safe size and all limits before I/O. Fixed header allocations are at most 40 bytes; each range request is split by `maxChunkBytes`. Pixel/gap contents are never read or copied. File-header and DIB-header blocks count once each; pixel array counts once, with one additional count for a nonempty gap. Thus accepted files need `maxChunks >= 3`, or 4 with a gap. Pixel-array and gap payloads separately obey `maxChunkBytes`; headers are split into bounded reads. Total file bytes and pixel count retain their existing limits.

Compute a 24-bit padded stride with ordinary integer arithmetic, avoiding 32-bit bitwise truncation. Check stride against available bytes divided by absolute height before multiplying rows. The accepted product therefore fits the declared 32-bit file extent and remains a safe integer. Huge dimensions fail without proportional reads or allocations. These bounds do not impose a hard deadline on an arbitrary adapter.

## Evidence, privacy, and compatibility

Return dimensions and acquisition context with metadata `NOT_PROBED`. Do not emit row-order transformations, resolution metadata, pixel observations, transparency, provenance, or authenticity conclusions. Existing hashing and unavailable analyzers retain their meanings. No permission, upload, retention, or dependency change is introduced.

Two original 3 × 2 fixtures cover both row orders, nonzero padding, and zero/explicit image-size declarations; Chromium independently verifies every output pixel. Structural/budget tests and the cross-format mutation corpus cover the probe, while CLI tests check conservative evidence and structured output. See the [execution record](../plans/2026-10-19-bmp-probe-cli.md).

## Primary references and deferred work

- Microsoft [BITMAPFILEHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapfileheader)
- Microsoft [GDI BITMAPINFOHEADER](<https://learn.microsoft.com/en-us/previous-versions/dd183376(v=vs.85)>)
- Microsoft [stride calculation](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader#calculating-surface-stride) and [bitmap header types](https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-header-types)

Broad BMP compatibility, full decoding, metadata/color-profile analysis, and extension BMP acquisition remain future work. Implementation and fixture construction are original code.
