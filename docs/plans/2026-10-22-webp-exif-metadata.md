# Phase 2: recorded EXIF in static WebP

## Objective, scope and acceptance

Extend useful recorded EXIF observations to static WebP in CLI and extension. Reuse the classic TIFF field subset from JPEG without implying a device, date/time truth, orientation-applied dimensions, provenance or authenticity. Leave new work uncommitted for review.

Acceptance: independently bound RIFF extent, chunk sizes/counts/padding and EXIF allocation; inspect exactly one EXIF chunk in a static container, require consistent VP8X EXIF presence flags, accept raw classic TIFF and explicitly disclosed single `Exif\0\0` compatibility prefix. Detect fields in II/MM byte order, distinguish scoped absence from malformed/ambiguous data and unavailable access, propagate resource/cancellation errors. No partial metadata on failure. Both clients present source-specific evidence and export it as text/JSON. Descriptor-only probing, core/fusion and original ten probe seeds stay unchanged.

Non-goals: animation, pixel decode/full WebP conformance, broader TIFF fields/types, Unicode, GPS/owner/serial, maker notes, thumbnails, XMP/IPTC/ICC, inference, network acquisition changes, dependencies/packages or new permissions.

## Context, architecture and boundaries

Branch `codex/webp-exif-metadata` starts at JPEG EXIF commit `f0d8973a4ecb734b717990024d6df8c39ffa9259`. Its final source audit found no BLOCKER/HIGH. [Actions 39725890980](https://github.com/mayanknandgowle/media-auth/actions/runs/39725890980) passed clean installs, Linux/Windows quality/stress and browser/package/fixture checks. Starting tree clean, baseline 476 tests. Main is not merged automatically.

Keep adapter modules in analyzers, depending only on core and own contracts. Share actual common byte-access/budget and EXIF-evidence mapping between the two current carriers; retain independent JPEG/WebP scanners and stable evidence IDs. JPEG adapter becomes v0.1.1 for shared access validation/error wording, preserving its subset/status semantics; new `media-auth.webp-exif` is v0.1.0. Registry now has nine explicit analyzers. TIFF parser remains responsible for selected recorded fields only; generic error wording must name the EXIF payload, not APP1. No changes to core/media/probe packages or fusion.

WebP scanner checks RIFF/WEBP signature and exact even extent, chunk bounds/zero padding and count/payload budgets, first/unique VP8X, static image presence/uniqueness, no animation, and EXIF chunk/flag consistency. Image/alpha/ICC reconstruction and pixel dimensions stay the probe's responsibility; direct metadata calls do not attest those. Unknown chunks are skipped but bounded. At most one EXIF chunk of 64 KiB is allocated, only after the container scan succeeds. Known TIFF directory/entry/text bounds remain independent. A single compatibility prefix is accepted with an extra limitation, never called standard-conformant.

## Steps

1. [x] Audit/publish JPEG EXIF, verify exact-commit CI; inspect roadmap, adapter/probe/client code and primary format references.
2. [x] Write this plan before implementation.
3. [x] Share bounded EXIF access/evidence mapping, add WebP scanner/adapter and register it.
4. [x] Add original raw-TIFF endian fixtures plus direct malformed/budget/cancellation/compatibility tests, client tests and independent verification.
5. [x] Extend text presentation, export/browser checks and docs/privacy/threat notes; record ADR 0011.
6. [x] Validate final source, package, review and record actual results; leave uncommitted.

## Validation

From a clean checkout, Node 24.x/npm 11.x:

```sh
npm ci
npx playwright install chromium
node scripts/generate-webp-exif-fixtures.mjs
npm run check
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
npm run test:browser
npm run stress:probes -- --seed 1 --iterations 2000
npm run package:extension
git diff --check
```

Use two new metadata fixtures, without changing the ten probe seeds or two JPEG metadata fixtures. Test all truncated prefixes, trailing/incorrect RIFF extent, huge/odd payloads, bad padding, missing/duplicate/misplaced headers, missing/duplicate images/EXIF, flags mismatch, animation, malformed TIFF, compatibility prefix, unknown chunks and no-EXIF scope. Guard ranges, enforce 4 KiB reads and preallocation checks, exercise maxBytes/maxChunkBytes/maxChunks and cancellation after I/O, reject unexpected unavailable results from deterministic memory mutations. Preserve JPEG regression coverage after common-code extraction. Browser checks actual download, source labels, text-only fields and encoded dimensions for local/page input. Supplemental host Pillow may independently verify recorded values; it is not a repository dependency.

Observed on Windows, 2026-10-22, Node 24.15.0 / npm 11.15.0. Installation/browser installation above are clean-checkout prerequisites. Dependencies are unchanged, so no new local clean-install claim is made; the parent JPEG commit's remote clean installs are separately verified above.

| Acceptance/check                      | Status and evidence                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorded fields and attribution       | PASS: raw TIFF II/MM fixtures, shared selected-field reader, `webp-exif.test.ts`, both CLI/file paths and browser local/page acquisition. WebP provider v0.1.0 and JPEG provider v0.1.1 keep independent evidence IDs and statuses; nine explicit registry entries.                                                                                                                     |
| Carrier bounds and scoped absence     | PASS: exact RIFF extent/headers/chunk bounds/padding, EXIF flags, duplicates, missing image, animation exclusion, metadata before/after image, unknown chunks, every truncated prefix and trailing bytes. No EXIF is scoped `NOT_DETECTED`; malformed/ambiguous selected data is `INCONCLUSIVE` without partial fields.                                                                 |
| Access and resource policies          | PASS: missing range/wrong MIME/I/O unavailable; validated input/payload/work budgets; 64 KiB accepted and first byte over rejected before payload I/O; 4 KiB requests; three chunks plus ten TIFF entries accept maxChunks 13 and reject 12; inexact ranges and cancellation before/after I/O. Deterministic byte mutations never silently turn parser errors into unavailable results. |
| JPEG regression and domain boundaries | PASS: all existing JPEG EXIF tests and independent JPEG decoder checks. Reader/evidence extraction preserves JPEG subset, status meanings, source/evidence IDs, limitations and conservative conclusions. Generic range/error wording/version changes are explicit; core/media/fusion, manifests and lockfile unchanged.                                                                |
| Full local validation                 | PASS: final `npm run check`, 499 tests / 17 files, strict typechecks, lint/import boundaries, formatting, builds and CLI smoke through four launch forms. New two fixture hashes are pinned in CLI smoke.                                                                                                                                                                               |
| Browser presentation/export           | PASS: exact production extension locally inspects fourteen fixtures without activeTab; literal untrusted EXIF text, encoded dimensions, source cards, actual JSON download, clear/error states and 320/640-pixel layouts. Disposable loopback-grant copy checks ten probe plus four EXIF page assets with no acquisition during discovery. Screenshots inspected.                       |
| Independent fixtures                  | PASS: Chromium 156.0.8078.4 decodes five WebP and four JPEG fixtures with pixel checks. Supplemental bundled Pillow 12.3.0 verifies all nine WebP EXIF values and encoded RGB pixels in both fixtures; it is not a repository/CI dependency.                                                                                                                                            |
| Existing probe stress                 | PASS: seed 1, 2,000 iterations, 4,000 calls plus 20 controls; digest `05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8`, unchanged. Original ten seeds and probes are unchanged.                                                                                                                                                                                        |
| Distribution                          | PASS: package built, repeated writer byte-identical. PowerShell independently extracts exactly eight entries and compares all SHA-256 values with current build/guide/license files. ZIP 205,060 bytes; SHA-256 `d9c019d6aec5e60d7fab65afed0fdb29b57c31ed06248fd37eab58b1917a3467`. Browser used the byte-matching dist directory, not the extracted directory.                         |
| Source and working tree               | PASS: all 158 nonignored file hashes unchanged throughout final check/stress/packaging; only this record updated afterward. Reviewed all 29 intended changed/new paths. Index empty; generated outputs ignored; no unrelated changes or new dependency/permission. Credential-pattern scan found no matches, not an exhaustive security audit.                                          |
| Native UI/new remote CI               | NOT VERIFIED: toolbar invocation, real activeTab granting and native Side Panel hosting for this build; remote CI for uncommitted WebP EXIF work. Parent JPEG CI is verified above. No signing/store publication or new push performed.                                                                                                                                                 |

Final source/diff review found no BLOCKER/HIGH or material mismatch with this bounded increment. Reviewed common reader/catch semantics, JPEG regression, carrier/header/payload/count boundaries, TIFF offsets and ignored graphs, status/attribution/fusion separation, DOM/export source labels, permissions/privacy, fixture provenance and honest limitations. New work remains uncommitted on `codex/webp-exif-metadata` for review. No inferred authenticity/provenance capability is introduced.

## Dependencies, risks and decisions

No dependencies/permissions added. Default input/pixel budgets unchanged; parser byte cap is not a total-memory guarantee. Hard execution isolation is deferred; cancellation remains cooperative. The WebP reader scans all RIFF chunks to establish scoped EXIF absence, so it must independently reject broken extents/padding and mismatched flags. Shared helpers must preserve JPEG evidence attribution and not broaden parser claims.

- 2026-10-22: Choose WebP carrier support before new metadata formats, building on an independently checked field reader and existing static probe.
- 2026-10-22: [Google's WebP container specification](https://developers.google.com/speed/webp/docs/riff_container) defines RIFF chunks, padding, VP8X flags and EXIF storage. [ExifTool's primary RIFF implementation](https://github.com/exiftool/exiftool/blob/master/lib/Image/ExifTool/RIFF.pm) distinguishes raw TIFF from an observed nonstandard prefix. Installed Pillow 12.3.0 source corroborates both decoding forms. No third-party parser code is copied or redistributed.
- 2026-10-22: Initial independent WebP verifier assumed Chromium would apply raw-TIFF orientation as it does for the JPEG fixture. Actual decoding remained 16 × 8. Corrected that test expectation and separately verified orientation 6/1 and every other recorded field with Pillow. Do not infer metadata validity or truth from decoder rendering behavior.

## Next milestones and deferred research

Next five concrete tasks, in order: final source audit/publication/CI of this increment; bounded PNG eXIf carrier; explicit conflicting recorded-metadata presentation without inferred verdicts; bounded XMP observations with an entity-safe parsing design; selected ICC header observations with format-specific bounds. Broader field/Unicode compatibility, provenance/trust integration and calibrated inference require distinct plans. These are not shipped capabilities.

## Final pre-commit source audit — 2026-10-22

Reviewed the actual WebP scanner, shared reader/evidence factory, TIFF reader and JPEG regression, registry/core execution boundary, client presentation/export, tests, generators/verifiers, manifests, architecture, ADRs and security/privacy docs against this increment and the complete available bootstrap specification. The Final specification variant is unavailable. All applicable acceptance rows above remain PASS within their stated scope; no BLOCKER/HIGH or material mismatch remains. Direct metadata inspection checks carrier framing/EXIF presence, not full pixel/alpha/profile reconstruction; the documentation accurately assigns that responsibility to the probe.

Fresh `npm run check` passed with 499 tests / 17 files, typechecks, lint/boundaries, formatting, builds and all CLI launch forms. Browser integration, independent WebP/JPEG decoding, the 2,000-case seed-1 stress run, packaging and diff checks passed. Repeated ZIP identity matches the recorded hash; independent extraction matches all eight current build/source entries. All 158 nonignored source hashes stayed unchanged during validation, followed only by this record update. Credential-pattern scan found no matches, index empty, all 29 changed/new paths intentional, no new dependency or permission. This is not an exhaustive security audit.

Recommendation: READY TO COMMIT. The user authorizes commit/push on `codex/webp-exif-metadata`, exact-commit remote CI verification and continuation afterward. Earlier uncommitted descriptions are historical. Native toolbar/activeTab/Side Panel hosting and this branch's remote CI remain NOT VERIFIED at pre-commit audit time.
