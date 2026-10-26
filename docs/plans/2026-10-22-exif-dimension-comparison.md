# Phase 2: recorded EXIF dimensions and numeric comparison

## Objective, scope and acceptance

Show selected recorded EXIF PixelXDimension/PixelYDimension in JPEG, static WebP and static PNG reports, beside a separate deterministic comparison with the probe's encoded axes. Display MATCH, DIFFERENT or NOT_COMPARABLE with both numeric pairs or an explicit reason. A numeric difference can reflect legitimate JPEG padding or historical/forged metadata; it never establishes editing, origin, authenticity or trust. Matching numbers do not establish those either. Leave this increment uncommitted for review.

Accept classic ExifIFD A002/A003 as one inline SHORT or LONG each, II/MM, positive unsigned values. Keep byte/allocation/entry/count/cancellation limits and discard partial observations for malformed supported fields. Record partial dimensions without inventing missing values; compare only complete pairs and valid encoded dimensions. Do not rotate either pair or confuse differently named date fields with a conflict. CLI inspect, local/page extension reports and JSON export must expose identical semantics. Existing fixtures/hashes/probes and four evidence states remain intact.

Non-goals: conflict resolution, forensic inference, fusion changes, pixel decoding, full EXIF conformance, new TIFF graphs/Unicode, XMP/IPTC/ICC, dependencies, permissions, network/storage changes, or another publication.

## Repository/context and current milestone

Starting clean on `codex/exif-dimension-comparison` at `0c9fadef014732b534c0343ef404de21a114077b`. PNG final audit found no BLOCKER/HIGH; [Actions 39730803954](https://github.com/mayanknandgowle/media-auth/actions/runs/39730803954) passed all three jobs for that exact commit, including clean installs and the new PNG verifier. Baseline 517 tests / 18 files. Follow AGENTS.md, .agent/PLANS.md and the authoritative bootstrap. Main is not automatically merged.

Current milestone is limited recorded-dimension presentation. Broad metadata comparison and authenticity/provenance remain later work.

## Architecture and boundaries

Extend the pure shared TIFF reader with two scalar tags; no allocation or image-size policy uses their claimed values. Update JPEG/WebP/PNG provider identities to v0.2.0 for expanded observations. The existing evidence factory adds a separately tagged NUMERIC_COMPARISON to detected EXIF details, alongside unchanged RECORDED observations. This describes only numeric equality of encoded-axis values, not an inferred conclusion. No extra analyzer, repeated media read, evidence voting, or registry/core/probe/fusion change. Ten providers remain explicit. A small pure helper owns the comparison union and reasons. UI validates the optional nested comparison at its report boundary and renders it as text with caveats; raw JSON contains the same values. See [ADR 0013](../adr/0013-exif-dimension-comparison.md).

## Steps

1. [x] Audit/publish PNG and verify exact-commit CI; inspect actual source/client/roadmap and primary references.
2. [x] Write this plan before edits.
3. [x] Add bounded numeric field parsing, explicit comparison semantics and source version changes.
4. [x] Add separate original match/difference fixtures for all three carriers, numeric type/endian/malformed/partial/budget tests and CLI/browser/export regressions.
5. [x] Document semantics, privacy/threat/limits, independent fixture evidence and ADR 0013.
6. [x] Run full validation, review final source/package, update this record and leave uncommitted.

## Validation

Clean-checkout prerequisites: Node 24.x/npm 11.x, `npm ci`, then `npx playwright install chromium`. No dependency change is planned. Ordinary checks consume pinned fixtures; explicitly regenerate comparison fixtures with `node scripts/generate-dimension-fixtures.mjs` and confirm hashes.

```sh
npm run check
node scripts/verify-png-fixtures.mjs
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
npm run test:browser
npm run stress:probes -- --seed 1 --iterations 2000
npm run package:extension
git diff --check
```

Exercise SHORT/LONG, both byte orders, one absent/zero/wrong type/count/duplicate tag, uint32 maximum without allocation, directory entry budget/cancellation, unchanged CRC/error behavior, and unrotated match despite orientation 6. Numeric differences must retain both claims and unknown origin/modification/unassessed confidence. Partial/absent fields or unavailable dimensions never become MATCH. UI rejects contradictory/malformed comparison payloads and remains text-only. Independently decode six new images and inspect dimension tags with host Pillow if available. Verify source hashes through final checks and package contents. Native toolbar/real activeTab/native Side Panel and uncommitted remote CI remain NOT VERIFIED.

Observed on Windows, 2026-10-22, Node 24.15.0 / npm 11.15.0. Install/browser-install commands above are reproduction prerequisites, not new local runs. Dependencies are unchanged; the parent PNG CI clean installs are verified separately above.

| Acceptance/check             | Status and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorded scalar correctness  | PASS: `exif-dimensions.test.ts` covers SHORT/LONG in II/MM, positive values through uint32 maximum, wrong type/count/zero/duplicates and partial pairs. Twelve entries consume exactly twelve work units; eleven stops with RESOURCE_LIMIT. Existing byte/allocation/count/cancellation tests pass unchanged. No pixel allocation uses claimed dimensions.                                                                                                 |
| Carrier/error independence   | PASS: real probes/analysis for all six fixtures, source v0.2.0 and ten providers. Invalid selected dimension count yields INCONCLUSIVE without partial fields in all three carriers, while independent SHA-256 remains detected. PNG corruption test repairs CRC to reach TIFF. Existing absence/unavailable/carrier/CRC regressions pass.                                                                                                                 |
| Comparison and conclusions   | PASS: complete pairs retain both values as MATCH/DIFFERENT; missing/partial/invalid/duplicate/non-EXIF observations or unavailable encoded dimensions never invent agreement. Orientation 6 does not rotate either pair. Padding-width example is a numeric difference with no cause inferred. Origin/modification stay UNKNOWN, provenance UNAVAILABLE, confidence unassessed.                                                                            |
| Report boundary              | PASS: supplied status/kind/pairs/reasons inconsistent with source observations or current dimensions are rejected. Legacy reports without comparison remain accepted. Fields and comparison render as text; no HTML interpretation.                                                                                                                                                                                                                        |
| Full check                   | PASS: `npm run check`, 537 tests / 20 files, strict typechecks, lint/import boundaries, formatting, builds and all four CLI launch smoke forms. CLI inspect exposes comparisons; probe remains descriptor-only. Six new hashes pinned in smoke tests.                                                                                                                                                                                                      |
| Browser/export               | PASS: `npm run test:browser` loads exact production manifest and locally inspects 22 fixtures without activeTab/URL acquisition. Ten probe plus twelve metadata assets also pass controlled page selection with a disposable loopback-grant copy. Discovery fetches zero assets, one explicit selection acquires one; comparisons, actual JSON download, clear/error states and 320/640 layouts pass. Reviewed the 640-pixel screenshot.                   |
| Independent fixtures         | PASS: PNG/JPEG/WebP verifier scripts decode every expected pixel in new and existing fixtures with Chromium 156.0.8078.4. Supplemental host Pillow 12.3.0 independently verifies both numeric tags, orientation and encoded 16 × 8 pixels for all six new files. No repository/CI dependency added. JPEG/PNG match fixtures display 8 × 16 in Chromium, WebP 16 × 8; reports retain encoded axes.                                                          |
| Probe regression             | PASS: seed 1 / 2,000 iterations / 4,000 calls plus 20 controls; unchanged digest `05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8`. Original seeds/probes remain unchanged.                                                                                                                                                                                                                                                               |
| Distribution/reproducibility | PASS: package build and repeated writer yield 223,398-byte ZIP, SHA-256 `28ba2022aec19b7d9dfc76dc6de304b91ba5a7062b8e519126e994b3da444e89`. Independent PowerShell extraction has exactly eight files, all matching current build/source by hash. Re-running the new fixture generator changes no hash. Browser ran matching dist files, not the extracted directory.                                                                                      |
| Source/tree/security         | PASS: production source matches the successful full check; all 179 nonignored hashes stay unchanged through browser/stress/package verification and fixture regeneration. Only this plan and fixture-document headings were edited afterward. All 38 changed/new paths intentional; index empty; output ignored. Package/lock/core/media/permissions unchanged. Credential-pattern scan finds no matches; this is not an exhaustive secret/security audit. |
| Remote/native                | NOT VERIFIED for this uncommitted increment: remote Actions, native toolbar invocation, real activeTab grant and native Side Panel hosting. Parent PNG commit CI is verified; automation's tab rendering/disposable host grant is explicitly limited.                                                                                                                                                                                                      |

Source/diff self-review found no BLOCKER/HIGH or material mismatch with this bounded plan. Checked scalar read bounds/endianness/counts, no allocation from claims, partial/error/availability semantics, numeric-versus-recorded separation, fixed source attribution/versions, unchanged conservative fusion, report validation/text rendering, permissions/privacy, fixtures and documentation. This does not implement general metadata conflict resolution or authenticity inference. Work remains uncommitted on `codex/exif-dimension-comparison`; no further milestone or publication is started.

## Dependencies, risks and decisions

### Final pre-commit audit, 2026-10-26

The user's “next” continues the established audit/publication/CI workflow and then the next bounded metadata increment. Reviewed actual scalar parsing, comparison inputs/statuses, factory/evidence attribution, report boundary/text rendering, clients, all changed scripts/tests/docs, ADR 0013, dependency direction, manifests and permissions. No BLOCKER/HIGH finding or material mismatch remains. Core/probes/fusion, dependencies/lockfile and production permissions are unchanged.

Fresh `npm run check` passed (537 tests / 20 files, typecheck/lint/boundaries/format/build/CLI smoke), as did independent PNG/JPEG/WebP Chromium fixture verifiers, `npm run test:browser`, seed-1/2,000-iteration probe stress, `npm run package:extension` and `git diff --check`. ZIP and stress digests match the earlier record. Independent extraction found exactly eight expected files, all matching source/build hashes. All 179 nonignored file hashes stayed unchanged through this audit; only this record was edited afterward. All 38 paths are intentional and the index is empty. No accidental generated output or unexplained dependency; credential-pattern scan found no matches (limited evidence, not an exhaustive audit). No local clean install was rerun because dependencies are unchanged. Remote CI will be verified for the exact published commit, including fresh installs. Current native toolbar, actual activeTab grant and native Side Panel remain NOT VERIFIED.

No new dependency or permission. Two scalar tags add bounded entry work, not image allocation. Recorded uint32 values may exceed real image limits and are retained as claims without allocating pixels. This is a selected classic subset, not a claim of current full EXIF standard conformance.

- 2026-10-22: CIPA's [EXIF/XMP mapping](https://cipa.jp/std/documents/e/DC-X010-2017.pdf) identifies A002/A003 pixel dimensions. Indexed publisher [Exif 2.3](https://www.cipa.jp/std/documents/e/DC-008-2012_E_C.pdf) defines SHORT/LONG count one and describes valid width versus padded JPEG SOF width; full PDF fetch timed out. Use numeric-difference wording with a padding caveat, not an inconsistency verdict. No publisher text/code is redistributed.
- 2026-10-22: [W3C PNG eXIf](https://www.w3.org/TR/png-3/#eXIf) warns that recorded information may describe historical image data. A difference does not resolve which claim applies or why it differs.

## Next milestones and deferred research

Next five: final source audit/publication/CI of this increment; bounded XMP observations with entity-safe parsing; selected ICC header observations; broader TIFF/Unicode compatibility; independently evaluated metadata reconciliation policies. Provenance verification, calibrated inference and general conflict resolution remain deferred.
