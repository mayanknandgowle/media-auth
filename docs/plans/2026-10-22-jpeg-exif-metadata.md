# Phase 2: bounded recorded JPEG EXIF fields

## Objective and acceptance

Add genuine local JPEG EXIF observations to CLI and extension reports: presence of an EXIF APP1 block, camera make/model, software, recorded date/time strings, orientation, and selected lens fields. Keep dimensions encoded and conclusions conservative. This first metadata increment deliberately supports selected classic TIFF ASCII/SHORT/LONG fields, not a complete EXIF suite.

Acceptance: identify EXIF only in JPEG APP1 headers before the first scan; parse little/big-endian TIFF primary directory plus one EXIF subdirectory; enforce input, segment, directory/entry, string, allocation, read and cancellation budgets independently of the probe. No-EXIF is `NOT_DETECTED` with an explicit pre-scan scope; malformed/ambiguous supported metadata is `INCONCLUSIVE`; unsupported media/byte access/I/O is `UNAVAILABLE`; valid recorded fields are `DETECTED`. Missing metadata never establishes authenticity. Budget/cancellation errors terminate normally through core policy.

Supply original deterministic metadata-bearing JPEG fixtures, adversarial/direct-adapter tests, client integration and browser field display/export tests, independent fixture decoding, docs/privacy/threat notes and ADR. Preserve probe-only output and fixture/corpus bytes. Leave this new increment uncommitted for review.

Non-goals: UTF-8/new TIFF types, XMP/IPTC/ICC, GPS/owner/serial extraction, maker notes, thumbnails, multiple EXIF blocks, arbitrary IFD graphs, full conformance/decoding, date/time truth or timezone inference, rotation of pixels, provenance verification, AI detection, new dependencies or packages.

## Context and boundaries

Branch `codex/jpeg-exif-metadata` starts at `33864cccd5f686dcafc683195e7c75667af88954`. The inspector audit/commit/push is complete and [Actions 39722749163](https://github.com/mayanknandgowle/media-auth/actions/runs/39722749163) passed Linux, Windows and browser jobs. Main is not automatically merged. Baseline has 445 tests and an installable inspector.

Keep the byte reader and TIFF parser in small host-independent analyzer adapter modules, using existing `MetadataAdapter`/`MetadataObservation` contracts. These are real current adapter responsibilities, so no additional package or contract migration is needed. Add a distinct `media-auth.jpeg-exif` analyzer/evidence identity; container dimensions remain independently attributed. Existing registry composition serves both clients. Core, fusion and media probes remain unchanged. Extension presents fields as text and labels their source. Registering an additional analyzer means eight cards and an extra unavailable result for formats it does not support; that is intentional truthful scope.

## Steps

1. [x] Verify inspector CI and inspect metadata contracts, analyzers, clients, tests and primary CIPA references.
2. [x] Write this plan before implementation.
3. [x] Add bounded JPEG APP1 scanner, selected TIFF parser and separate evidence analyzer.
4. [x] Generate original endian fixtures; add malformed/budget/cancellation tests and client/browser regressions.
5. [x] Update report presentation, scope/limitations, privacy/threat docs, attribution and ADR 0010.
6. [x] Validate final source, independently decode fixtures, review, rebuild package and leave uncommitted.

## Validation

```sh
npm ci
npx playwright install chromium
node scripts/generate-exif-fixtures.mjs
npm run check
node scripts/verify-jpeg-fixtures.mjs
npm run test:browser
npm run stress:probes -- --seed 1 --iterations 2000
npm run package:extension
git diff --check
```

Exact tests: all truncated EXIF prefixes, huge counts/offsets, duplicate blocks/tags, cyclic/overlapping directories, wrong known types, unterminated/control/non-ASCII text, orientation bounds, unknown ignored tags, post-scan scope, capped exact range requests, inexact adapters, cancellation and source/evidence meanings. Existing file-acquisition deadline tests remain applicable. Browser tests check recorded fields and export without applying orientation. Existing ten probe seeds remain unchanged; new fixtures live under `tests/fixtures/metadata/`.

Observed on Windows, 2026-10-22, Node 24.15.0 / npm 11.15.0. The clean-install/browser-install commands above are prerequisites from a clean checkout; no dependency changed in this increment, so the existing validated install was used. Generator output reproduces the two pinned fixture hashes. No new clean-install claim is made for this increment.

| Acceptance/check                            | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected recorded fields, both endiannesses | PASS: `jpeg-exif.test.ts`; real pipeline retains encoded 16 × 8, separate EXIF attribution and unassessed conservative conclusion.                                                                                                                                                                                                                                                                               |
| Four evidence states                        | PASS: supported/empty block detected; baseline pre-scan absence scoped; malformed fields/duplicate blocks inconclusive without partial data; non-JPEG/missing read/I/O unavailable. CLI malformed-TIFF test preserves independent dimensions/hash results.                                                                                                                                                       |
| TIFF safety and subset                      | PASS: every truncated APP1 prefix, duplicate tags, header/table overlap, cycles, huge offsets/counts, wrong types, text/termination/control/non-ASCII errors, exact 256-character boundary, inline/empty strings, ignored unknown tags and orientation bounds.                                                                                                                                                   |
| Independent read/work limits                | PASS: 4 KiB exact range cap over a padded APP1; payload rejected before payload read when over budget; marker/fill/entry, input, directory/text budgets and cancellation before/after I/O. Memory mutation tests reject unexpected unavailable results.                                                                                                                                                          |
| CLI and file-client integration             | PASS: descriptor-only probe remains unchanged; both EXIF files pass all four built CLI launch forms with pinned hashes; local-file/report tests preserve acquisition and JSON.                                                                                                                                                                                                                                   |
| Full check                                  | PASS: final `npm run check`, 476 tests / 16 files, strict typechecks, ESLint/import boundaries, formatting, all builds and expanded CLI smoke.                                                                                                                                                                                                                                                                   |
| Browser integration                         | PASS: `npm run test:browser`; exact production extension locally inspects twelve fixtures without activeTab, renders EXIF as literal text, exports real downloaded JSON, clears state, rejects bad inputs and fits 320/640 pixels. Disposable loopback-grant copy additionally acquires the ten probe and two EXIF page assets; discovery does not fetch media.                                                  |
| Independent fixture validation              | PASS: Chromium 156.0.8078.4 decodes all four JPEGs and every gray RGBA pixel; orientation 6 renders 8 × 16. Separately, host bundled Pillow 12.3.0 verified all nine EXIF field values, encoded 16 × 8 and all grayscale pixels for both byte orders. Pillow is supplemental tooling, not a repository dependency or CI requirement.                                                                             |
| Existing probe stress                       | PASS: seed 1, 2,000 iterations, 4,000 calls plus 20 controls; digest `05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8`, unchanged. Original ten seeds/probe sources unchanged.                                                                                                                                                                                                                  |
| Distribution                                | PASS: package rebuilt, repeated packaging byte-identical; PowerShell Expand-Archive independently extracted exactly eight entries, all SHA-256 values match current build/guide/license sources. ZIP 194,078 bytes, SHA-256 `9099766670910b5e51a937103dacafad8fb3c5c853d456d20bb05b1923a6712f`. Browser test ran against the matching dist directory, not the extracted directory.                               |
| Final source/tree                           | PASS: 149 nonignored file hashes identical throughout final full check. Afterward only this execution record is updated. Reviewed all 26 intended changed/new paths; index empty, generated build/package/test outputs ignored. Manifests, lockfile, core, media and workflow unchanged; no dependency/permission changes. Credential-pattern scan had no matches, without claiming exhaustive secret detection. |
| Remote CI and native UI                     | NOT VERIFIED for this uncommitted EXIF increment: no push/CI, native toolbar invocation, real activeTab grant or native Side Panel hosting. Inspector parent commit CI is verified in Context above. Historical foundation native observations do not verify this build.                                                                                                                                         |

Final source review found no BLOCKER/HIGH or material mismatch with this bounded increment. Reviewed parser bounds/error precedence, evidence/status/attribution, registry composition, client state/export and text rendering, privacy, permissions, source separation and deferred claims. An early typecheck narrowing issue and overlapping-directory error precedence were corrected before final validation. All new work remains uncommitted on `codex/jpeg-exif-metadata` for review; this does not implement broad EXIF compliance or any authenticity/provenance detector.

## Limits, dependencies and risks

No dependencies added. At most one JPEG APP1 EXIF payload (under 64 KiB), at most two directories with 128 entries each, and at most 256 text characters per supported field. Count markers/fill bytes and directory entries against `maxChunks`; bound declared segment payloads and individual requests by policy. No allocation follows unbounded counts. Cancellation is cooperative; no hard parser timeout is claimed. GPS and other opaque EXIF bytes may exist in acquired input memory but are not extracted or exported as observations. A file's own date/camera/software fields can be forged.

## Decisions/discoveries

- 2026-10-22: Begin Phase 2 with JPEG EXIF, prioritizing useful recorded facts over speculative inference. Explicit scope prevents absence before the first scan from being mislabeled as absence of all metadata.
- 2026-10-22: Use existing analyzer adapter boundary, adding a separate analyzer to preserve mixed statuses and attribution. The recorded-dimensions adapter must not silently absorb malformed/absent EXIF.
- 2026-10-22: Retain a narrow classic ASCII subset; newer EXIF text representations and unsupported known types remain explicit limitations. Use CIPA EXIF field/layout definitions as primary references.

## Next milestones and deferred research

Review/publish this increment only with authorization. Later metadata formats, Unicode, dates/timezones, broader EXIF compatibility, true provenance adapters and calibrated forensic research need separate bounded plans.

## Final pre-commit source audit — 2026-10-22

Read the complete available bootstrap specification in Downloads (the Final variant was not present), AGENTS/planning guidance, actual scanner/TIFF/evidence code, registry/core execution, report rendering/validation, client and browser tests, generators/fixture verifier, manifests, ADR and security/privacy/architecture documentation. The applicable acceptance rows above remain PASS within their explicit scope. No BLOCKER/HIGH or material specification mismatch remains. The pure metadata boundary, independent resource checks, recorded-versus-inferred distinction, four statuses, conservative fusion, source labels and unchanged permissions are verified in source, not inferred from test counts.

Fresh `npm run check` passed with 476 tests / 16 files, all quality checks, builds and CLI launch forms. `npm run test:browser`, `node scripts/verify-jpeg-fixtures.mjs`, the 2,000-case seeded stress campaign and packaging passed. Package size/hash reproduce the recorded values. All 149 nonignored file hashes stayed unchanged during this audit; only this record changes afterward. Credential-pattern scan found no matches; all 26 changed/new paths belong to the increment, index empty, outputs ignored, no dependency/lockfile changes. This is not an exhaustive security audit.

Recommendation: READY TO COMMIT. User now authorizes commit/push on `codex/jpeg-exif-metadata`, exact-commit remote CI verification and continuation afterward. Earlier uncommitted statements are historical. At pre-commit audit time, native toolbar/activeTab/Side Panel hosting and new remote CI remain NOT VERIFIED; only actual subsequent run results may establish remote CI.
