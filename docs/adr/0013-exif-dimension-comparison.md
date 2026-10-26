# ADR 0013: recorded EXIF dimensions and explicit numeric comparison

Status: accepted for this increment, 2026-10-22.

## Decision

Extend the shared classic TIFF subset with ExifIFD PixelXDimension (A002) and PixelYDimension (A003): one inline SHORT or LONG, positive, either byte order. Keep primary IFD dimensions outside scope; only these explicitly named tags are added. Values up to uint32 maximum are recorded claims and never drive allocation, probing, pixel limits or orientation. Malformed supported types/counts/zero/duplicates discard all EXIF observations as inconclusive, preserving independent dimensions/hash evidence. Missing one or both tags does not invalidate other selected fields.

Update JPEG, WebP and PNG EXIF identities to v0.2.0. Keep the same ten explicit providers, carrier checks/budgets, core contracts and baseline fusion. The evidence factory keeps RECORDED observations and adds a separately tagged `dimensionComparison: { kind: NUMERIC_COMPARISON, ... }` to detected EXIF details. A pure helper compares only complete recorded pairs with positive safe-integer encoded axes. It emits MATCH or DIFFERENT with both pairs, or NOT_COMPARABLE with a reason. This nested state is independent of the four evidence availability states: detected EXIF without dimensions remains detected, with no invented agreement. No repeated reads, extra analyzer, opaque fusion policy or global conclusion change.

The extension recomputes the expected comparison at the report boundary from validated recorded scalar inputs and current dimensions, rejecting contradictory supplied status/pairs/reasons. It renders source fields and comparison as text; JSON export preserves the same structured data. Older reports without a comparison remain displayable. Descriptor-only CLI probe remains unchanged.

## Interpretation and limits

The comparison reports numeric equality on encoded axes. It does not apply orientation or compare timestamps with different meanings. DIFFERENT is not a forensic inconsistency verdict: valid EXIF JPEG padding can make PixelXDimension differ from SOF width, and PNG eXIf may describe historical data. No cause is established or claim resolved. MATCH does not prove current metadata, device, authorship, provenance or authenticity. Conclusions retain unknown origin/modification and unassessed confidence.

No new dependency, permission, acquisition, persistence or remote operation. Existing payload/range/directory/entry/cancellation bounds apply. Two extra scalar entries add bounded work; a huge recorded value causes no huge allocation. This remains a limited classic subset, not full EXIF conformance or an image decoder.

## Validation and references

Six new original synthetic fixtures cover SHORT/II matching 16 × 8 with orientation 6 and LONG/MM differing 32 × 16 with orientation 1, across JPEG/WebP/PNG. Image payloads and previous fixtures are unchanged. Tests cover both types in both orders, boundaries, malformed/partial/duplicate fields, independent identity, work limits, supplied comparison tampering, CLI/local/page display/export and conservative conclusions. Independent Chromium and supplemental Pillow inspect image pixels/recorded dimensions. See [execution record](../plans/2026-10-22-exif-dimension-comparison.md).

Primary references: [CIPA EXIF/XMP mapping](https://cipa.jp/std/documents/e/DC-X010-2017.pdf), [publisher EXIF 2.3](https://www.cipa.jp/std/documents/e/DC-008-2012_E_C.pdf), and [W3C PNG eXIf](https://www.w3.org/TR/png-3/#eXIf). Indexed publisher material supplies tag/type/count and padding semantics; full historical PDF retrieval timed out. No publisher text, external parser or external image is redistributed. General metadata reconciliation remains future work.
