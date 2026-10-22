# Phase 2: recorded EXIF in static PNG

## Objective, scope and acceptance

Add local PNG eXIf observations to CLI and extension using the established classic TIFF field subset. Keep recorded information distinct from inference, encoded dimensions unchanged, and conclusions conservative. Leave this increment uncommitted for review.

Acceptance: independent signature/chunk extent/name/order checks, a terminal IEND and nonempty consecutive image data, streamed CRC checks for every chunk, exactly one raw-TIFF eXIf before IDAT, explicit byte/payload/allocation/work/cancellation budgets and four evidence states. Retain only the same bytes whose eXIf CRC was checked, at most 64 KiB; discard observations if any later carrier check fails. II/MM fixtures and adversarial tests plus CLI/browser fields/export and independent decoding must pass. No-EXIF is scoped `NOT_DETECTED`; malformed/ambiguous/excluded data is `INCONCLUSIVE`; unavailable MIME/range/I/O is `UNAVAILABLE`; resource/cancellation errors propagate.

Non-goals: full PNG/EXIF conformance, pixel inflation/decoding, animation, broader TIFF fields/Unicode, GPS/owner/serial, maker notes/thumbnails, XMP/IPTC/ICC/text extraction, metadata conflict inference, authenticity/provenance, dependencies/packages, permissions or acquisition changes.

## Context and boundaries

Branch `codex/png-exif-metadata` starts at `bee2f90bc1ae5ff607c6c70e0b67a3d5b25af8e4`. Its final WebP EXIF audit found no BLOCKER/HIGH; [Actions 39728331657](https://github.com/mayanknandgowle/media-auth/actions/runs/39728331657) passed Linux/Windows quality/stress and browser/fixture/package jobs with clean installs. Starting tree clean, baseline 499 tests. Main is not automatically merged.

Add `media-auth.png-exif` v0.1.0 in analyzers; reuse existing bounded reader, TIFF parser and evidence factory. Extend the common MIME union to PNG without changing JPEG/WebP semantics or versions. The explicit registry now has ten providers, with source-specific text cards. Core/media/probes/fusion remain unchanged. Descriptor `NOT_PROBED` remains the probe's statement, with separate EXIF evidence.

Keep the small CRC update routine private to this adapter: package boundaries allow analyzers to depend only on core, so exporting probe internals or creating another utility package for it is unwarranted. Node's built-in CRC32 is an independent test/fixture oracle; no Node API enters production parsing. Check every chunk checksum through requests at most min(4096, maxChunkBytes), without allocating whole unknown/image payloads. Chunk headers, 4 KiB CRC payload blocks and TIFF entries share maxChunks. eXIf allocation is independently capped at 64 KiB, made only after header/budget/position checks and filled from CRC-checked reads. No reread of unverified EXIF bytes. Complete PNG image-header/palette/color semantics remain the media probe's responsibility; no pixel decompression occurs.

## Steps

1. [x] Audit/publish WebP EXIF and verify exact-commit CI; inspect source, boundaries, roadmap and primary PNG reference.
2. [x] Write plan before implementation.
3. [x] Add bounded CRC/framing PNG metadata adapter and registry/presentation integration.
4. [x] Add original endian fixtures, direct/adversarial/budget/cancellation tests and client/browser coverage.
5. [x] Add independent PNG fixture verifier and CI step; update docs, privacy/threat notes, attribution and ADR 0012.
6. [x] Validate, review final source/package, record evidence and leave uncommitted.

## Validation

Clean-checkout prerequisites: Node 24.x/npm 11.x, then install dependencies and test Chromium. No dependency change is planned.

```sh
npm ci
npx playwright install chromium
node scripts/generate-png-exif-fixtures.mjs
npm run check
node scripts/verify-png-fixtures.mjs
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
npm run test:browser
npm run stress:probes -- --seed 1 --iterations 2000
npm run package:extension
git diff --check
```

Test all prefixes/trailing bytes, duplicate/missing/late eXIf, invalid names/lengths, chunk CRC failures including after metadata, missing/repeated headers/endings, empty/discontinuous IDAT, excluded animation/unknown critical chunks, wrong TIFF headers/prefixes, huge counts/offsets, exact 64 KiB and work limits, guarded 4 KiB reads, tiny budgets and cancellation after I/O. Preserve JPEG/WebP regressions and ten probe seeds. Browser exercises sixteen original fixtures locally and ten probe plus six metadata fixtures on controlled pages, including actual JSON download and text-only software. Observe decoder orientation behavior instead of assuming it; separately verify recorded fields with supplemental host Pillow when available.

Observed on Windows, 2026-10-22, Node 24.15.0 / npm 11.15.0. Clean install/browser installation above are reproduction prerequisites; no dependencies changed, so no new local clean-install claim is made. Parent WebP remote clean installs are separately verified above.

| Acceptance/check                | Status and evidence                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recorded fields and scope       | PASS: II/MM fixtures, real image probing/analysis, independent PNG evidence identity and ten providers. Encoded 16 × 8 and conservative unassessed conclusions preserved. No-EXIF known PNG yields scoped absence only when range access exists; no access remains unavailable.                                                                                                                  |
| Carrier/CRC correctness         | PASS: all truncated prefixes, trailing bytes, bad names/lengths, duplicate/missing/late/prefixed metadata, excluded animation/critical chunks, header/palette/image/end framing and CRC corruption in every chunk. Later unknown-chunk CRC failure discards earlier fields.                                                                                                                      |
| Retained-byte integrity         | PASS: mutable range-handle regression changes live Make bytes after the data read; parser still reports the original CRC-checked retained Make and performs no EXIF reread.                                                                                                                                                                                                                      |
| Independent budgets/access      | PASS: exact 64 KiB/over-cap pre-read rejection, 4 KiB guarded ranges, exact seventeen work units for the small fixture, twenty-one with multi-block opaque CRC data, huge TIFF count, chunk floods, inexact adapters, input/payload/work validation and cancellation before/after I/O.                                                                                                           |
| Full validation                 | PASS: `npm run check`, 517 tests / 18 files, strict typechecks, lint/import direction, formatting, builds and CLI smoke through all four launch forms. New PNG hashes pinned; valid-container/malformed-TIFF CLI tests repair CRC so they reach EXIF independently of the probe.                                                                                                                 |
| Browser/client behavior         | PASS: production extension locally inspects sixteen fixtures without activeTab; PNG/JPEG/WebP text fields, encoded facts, actual downloaded JSON, clear/error states and 320/640 layouts. Disposable loopback-grant copy acquires ten probe plus six metadata page assets, one per explicit selection; discovery does not acquire media. Screenshot reviewed.                                    |
| Independent fixtures/regression | PASS: `verify-png-fixtures.mjs` checks all pixels in three PNGs; pinned Chromium 156.0.8078.4 displays orientation 6 as 8 × 16. Supplemental host Pillow 12.3.0 verifies all nine EXIF fields and encoded RGBA pixels in both new fixtures; no repository/CI dependency added. JPEG/WebP verifier regressions pass.                                                                              |
| Existing probe stress           | PASS: seed 1 / 2,000 iterations / 4,000 calls plus 20 controls, digest `05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8`, unchanged. Original ten seeds and probes unchanged.                                                                                                                                                                                                   |
| Distribution                    | PASS: `npm run package:extension` and repeated writer produce 215,857-byte ZIP, SHA-256 `02bc1b511b6897ea2176955a2b7eeafabd9e3813b0ca7619ace514ccbaee2647`. Independent PowerShell extraction has exactly eight entries, all matching current build/guide/license hashes. Browser ran on matching dist files, not the extracted folder.                                                          |
| Source/tree                     | PASS: current production source matches the successful full check; all 166 nonignored hashes unchanged during subsequent browser/stress/package verification. Only this record updated afterward. All 28 changed/new paths intentional; index empty; outputs ignored; core/media/dependencies/permissions unchanged. Credential-pattern scan found no matches, not an exhaustive security audit. |
| Remote/native verification      | NOT VERIFIED for uncommitted PNG work: remote CI (including the new configured PNG-verifier step), native toolbar invocation, real activeTab grant and native Side Panel hosting. Parent WebP CI is verified above. No new commit/push or store signing/publication.                                                                                                                             |

Final source/diff review found no BLOCKER/HIGH or material mismatch with this bounded increment. Reviewed CRC state/ranges/captured bytes, complete scan before field output, partial-data/error semantics, count/allocation/byte limits, shared field parsing and unchanged JPEG/WebP behavior, explicit composition, DOM/export, permission/privacy and honest scope. Early test failures exposed incorrect test offsets and outdated absence/source-ID expectations; those were corrected before the full validation. New work stays uncommitted on `codex/png-exif-metadata` for review; no inferred authenticity/provenance functionality is added.

## Dependencies, risks and decisions

### Final pre-commit source audit, 2026-10-22

The user subsequently authorized final audit, commit/push of `codex/png-exif-metadata`, exact-commit CI verification and continuation with the next bounded milestone. Source review covered the bootstrap acceptance criteria, AGENTS/plan rules, all changed source/tests/scripts/docs, shared TIFF/access/evidence logic, core contracts/fusion, package manifests/import enforcement, production permissions and export rendering. No BLOCKER/HIGH finding or material specification mismatch remains. No new dependency, permission, network acquisition or core/fusion change. Historical native Chrome observations do not verify this build's toolbar, real activeTab grant or native Side Panel.

Fresh `npm run check` passed (517 tests / 18 files, strict typechecks, lint/boundaries, formatting, builds, all CLI launch smoke forms). Fresh PNG/JPEG/WebP independent Chromium fixture decoders, `npm run test:browser`, seed-1/2,000-iteration probe stress and `npm run package:extension` passed. Stress and ZIP digests match the table above. Independent PowerShell ZIP extraction found exactly eight expected entries, each matching current build/source by SHA-256. All 166 nonignored file hashes remained unchanged through these checks; only this audit record changed afterward. All 28 paths are intentional; no staged files, unexplained dependencies or accidental generated output. A credential-pattern scan found no matches (limited evidence, not an exhaustive secret/security audit). No local clean install was rerun because dependencies are unchanged; fresh remote clean installs will be checked after publication. Remote PNG CI remains NOT VERIFIED until that run completes.

No new dependency or permission. CRC is corruption detection, never cryptographic identity or authenticity. Checking all CRCs costs bounded reads/CPU but prevents malformed streams from silently yielding absence. Work includes CRC blocks as well as chunks/entries. Cancellation is cooperative, not a hard timeout. A 64 KiB metadata allocation/input byte cap is not a peak-memory guarantee. Unsupported payloads can be present in acquired memory but are not extracted/exported.

- 2026-10-22: [W3C PNG Third Edition](https://www.w3.org/TR/png-3/#eXIf) defines a single raw-TIFF eXIf before IDAT. Reject JPEG-style prefixes and post-IDAT eXIf rather than applying WebP compatibility rules. Recorded fields may be stale/historical and are not independently verified claims. No specification text or external parser code is copied.
- 2026-10-22: Preserve verified EXIF bytes during the CRC pass so the parser cannot read a different unchecked payload afterward.

## Next milestones and deferred research

Next five: final audit/publication/CI of this increment; explicit conflicting recorded-metadata presentation; bounded XMP observations with entity-safe parsing; selected ICC header observations; separately designed broader TIFF/Unicode compatibility. Provenance/trust and calibrated inference require later plans and are not shipped capabilities.
