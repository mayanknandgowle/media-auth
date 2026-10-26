# ADR 0015: selected recorded static WebP XMP

Status: accepted for this increment, 2026-10-26.

## Decision

Add `media-auth.webp-xmp` v0.1.0 as the twelfth explicitly composed provider, separate from WebP EXIF and JPEG XMP. The `XMP ` FourCC ends with an ASCII space and its payload is the raw XMP packet; no JPEG APP1 identifier or EXIF compatibility prefix is accepted. Require an extended header and agreement between its 0x04 flag and one unique XMP chunk. Duplicate rejection is our ambiguity policy, stricter than the format's option to choose the first packet.

Extract the existing WebP EXIF scan into `webp-metadata.ts`. Both adapters independently scan exact static RIFF extent, chunk lengths/padding and selected format flags before parsing payloads; late errors discard earlier metadata. Metadata can precede/follow image data. Require one nonempty VP8/VP8L chunk and reject animation/ANIM/ANMF. Broader image/alpha/color-profile reconstruction checks remain in the media probe; the metadata scanner does not claim full container validation. Unselected payloads are skipped, subject to framing/budget checks. Existing EXIF semantics, diagnostic labels, work counts, 64 KiB selected allocation and compatibility disclosure stay intact.

## Bounds and evidence

Cap the selected XMP packet at 65,504 bytes before payload reads/allocation. This is a project inspection policy shared with JPEG's existing packet reader, not the WebP format maximum. Input/chunk/work budgets, exact range results, 4 KiB requests and cooperative cancellation remain independent. Reuse ADR 0014's limited rejecting UTF-8 XML/RDF subset and node/depth/attribute/namespace/value/field caps without broadening accepted XML. The generic parser's allocation diagnostic now names project policy instead of JPEG. URLs/entities are never externally resolved.

Record packet presence and selected XMP Basic creator-tool/date strings; preserve values without timestamp verification or reconciliation. DETECTED means recorded claims were read, NOT_DETECTED means no chunk in the declared exact static RIFF search scope, INCONCLUSIVE means malformed/unsupported/ambiguous input without partial fields, and UNAVAILABLE means wrong MIME/missing range/I/O. Resource/cancellation errors propagate. The recorded-metadata factory keeps XMP separate from EXIF dimension comparisons. No confidence, provenance, modification or authenticity inference changes.

CLI and extension use the same explicit composition. A source-specific WebP XMP card uses literal text; deliberate JSON exports include potentially sensitive/forged metadata. No dependencies, permissions, acquisition, persistence, core, probes or fusion changes.

## Validation and references

Two original Apache-2.0 fixtures carry existing synthetic attribute/element packets beside original EXIF and unchanged lossless pixels. Tests cover independent EXIF/hash, raw packet syntax, duplicates/flags/padding/extent/animation/truncations/later failures, exact allocation/read/work/input bounds, cancellation and deterministic mutations. The shared XML adversarial suite remains applicable. CLI/local/page selection and JSON export are exercised; Chromium independently checks decoded pixels. See the [execution record](../plans/2026-10-26-webp-xmp-metadata.md) for executed results and limits.

Primary reference: [Google WebP container specification](https://developers.google.com/speed/webp/docs/riff_container), RIFF padding, extended flags and metadata section. Existing XML/RDF references and deliberate non-goals remain in [ADR 0014](0014-bounded-jpeg-xmp.md). No external code, media or specification text is redistributed.
