# Phase 2: bounded recorded static WebP XMP

## Objective and acceptance

Expose recorded CreatorTool/CreateDate/ModifyDate/MetadataDate from one static WebP XMP chunk in CLI and extension, separately from EXIF. Accept the existing limited UTF-8 XML/RDF subset, preserve raw dates and unknown conclusions. Leave this increment uncommitted for review.

Acceptance: exact RIFF extent and zero odd padding; one nonempty static image; first extended header for metadata; unique `XMP ` chunk and matching VP8X XMP flag; complete scoped carrier scan before returning fields. Metadata may precede/follow image data. Absence is NOT_DETECTED within this scope, malformed/unsupported/ambiguous data INCONCLUSIVE without partial fields, wrong MIME/missing range/I/O UNAVAILABLE, and resource/cancellation errors propagate. Independent EXIF/hash and existing JPEG XMP behavior must remain intact.

Non-goals: animation, general WebP/XML/RDF/XMP conformance, new scalar fields, JPEG identifier compatibility in WebP, extended packet assembly, EXIF/XMP reconciliation, normalized timestamps, authenticity/provenance/detection, new dependencies/permissions/acquisition/storage, PNG XMP, or publishing this increment.

## Repository/context/current milestone

Starts clean at JPEG XMP commit `7b876066f778343bbf4368516df2fad545c302db` on new `codex/webp-xmp-metadata`. Final source audit found no BLOCKER/HIGH. [Actions 40273344535](https://github.com/mayanknandgowle/media-auth/actions/runs/40273344535) passed all Linux/Windows/browser jobs and steps for that exact head, including clean installs, independent decoders, packaging and browser automation. Baseline 571 tests / 22 files. Follow bootstrap, AGENTS.md and .agent/PLANS.md. Current milestone is only static WebP XMP; main is not merged automatically.

## Architecture and boundaries

Extract the existing WebP EXIF carrier walk into a small shared metadata scanner parameterized by selected format. Preserve EXIF checks/work counts/64 KiB cap; XMP selects FourCC `XMP ` and flag 0x04. Inspect only selected metadata presence/flag in each adapter; broader image/alpha/profile checks stay in the media probe. Add `media-auth.webp-xmp` v0.1.0 as twelfth explicit provider. Reuse neutral bounded byte access, XML/RDF reader and four-state recorded evidence factory. XMP receives no EXIF numeric comparison. No core/media/fusion/runtime dependency/permission changes. Render a source-specific literal-text card; deliberate JSON exports include the recorded claims.

WebP chunk payload is the packet itself, without JPEG's APP1 identifier. Apply a project policy cap of 65,504 packet bytes before payload allocation (not a general WebP format limit). Retain existing 4 KiB bounded reads, input/chunk/work budgets, cancellation and XML limits: depth 8, nodes 128, attributes 16, namespace bindings 32, selected strings 256 UTF-16 units. URLs/entities are never resolved. No partial fields after later carrier/XML failures. Document decisions in ADR 0015.

## Ordered steps

1. [x] Audit/publish JPEG XMP, verify exact-commit CI, inspect existing source and primary WebP container specification.
2. [x] Write this plan before substantial edits.
3. [x] Extract shared RIFF scan, implement WebP XMP adapter and explicit composition/card.
4. [x] Add original attribute/element fixtures retaining EXIF/pixels, carrier/security/budget/cancellation tests and CLI/browser/export coverage.
5. [x] Update current-status, privacy/threat/architecture/fixture documentation and ADR.
6. [x] Validate, review source/diff/package/tree, record results and leave uncommitted.

## Validation

Clean checkout: Node 24.x/npm 11.x; `npm ci`; `npx playwright install chromium`. No planned dependency change. Generate fixtures explicitly with `node scripts/generate-webp-xmp-fixtures.mjs`; checks use pinned bytes.

```sh
npm run check
node scripts/verify-webp-fixtures.mjs
npm run test:browser
npm run stress:probes -- --seed 1 --iterations 2000
npm run package:extension
git diff --check
```

Test both scalar encodings and coexisting EXIF, packet presence, namespace/entity limits already covered by the shared parser suite, absence/unavailable/malformed distinctions, every truncated carrier prefix, duplicate chunks, flag mismatch, odd padding, later failure, raw payload versus invalid JPEG identifier, animation rejection, exact allocation/read/work/input limits, cancellation and deterministic mutations. Verify CLI signature dispatch, twelve providers, literal Unicode UI, JSON export/clear and only explicitly selected page acquisition. Independently decode all WebP fixture pixels; supplemental host XML parsing if available. Inspect deterministic archive and credential patterns; compare source snapshots through validation. Remote CI and native toolbar/real activeTab/native Side Panel for this uncommitted build remain NOT VERIFIED.

## Dependencies, risks and decisions

No dependencies/permissions. Existing rejecting XML subset intentionally yields INCONCLUSIVE for valid unsupported XMP. Recorded metadata is forgeable and potentially sensitive. Limits/cancellation are cooperative, not a process sandbox or a peak-memory guarantee. Sharing the carrier scan must preserve existing EXIF behavior and resource accounting.

Primary reference inspected 2026-10-26: [Google WebP container specification](https://developers.google.com/speed/webp/docs/riff_container), extended feature flags, metadata chunks, arbitrary metadata ordering and RIFF padding. Duplicate rejection is MediaAuth's ambiguity policy; the format permits readers to choose the first. Existing Adobe/W3C subset decisions remain in ADR 0014. No external code/media is copied.

## Next milestones and deferred research

Next five: final source audit/publication/CI for this increment; PNG XMP carrier design with bounded decompression policy; selected ICC header observations; broader TIFF/Unicode compatibility; explicit metadata conflict/reconciliation design. General XMP, authenticated provenance and calibrated inference remain deferred research.

## Observed validation and self-review, 2026-10-26

Windows, Node 24.15.0 / npm 11.15.0. Dependencies and lockfile unchanged; no new local npm ci. Clean-checkout prerequisites are above; exact parent JPEG XMP CI clean installs are separately verified.

| Acceptance/check            | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recorded claims/composition | PASS: attribute/element WebP fixtures report packet presence and all four raw XMP claims, separately from detected EXIF/hash; twelve providers, encoded 16 × 8, unassessed confidence and no XMP dimension comparison. Origin/modification UNKNOWN, provenance UNAVAILABLE. JPEG XMP remains separate and its regressions pass.                                                                                                                                                                                            |
| Carrier and failure states  | PASS: raw packets before/after image data; scoped absence versus wrong MIME/missing ranges/I/O/invalid size; every truncated carrier prefix; duplicates/flag mismatch, wrong RIFF extent/signatures, trailing bytes, missing/duplicate/empty image, misplaced/short VP8X, animation, nonzero odd padding and later chunk failures. Empty/malformed UTF-8/XML, JPEG identifier and extended declaration reject without partial XMP; malformed XML preserves independent EXIF.                                               |
| Resource/cancellation       | PASS: exact project packet cap 65,504 accepted and 65,505 rejected before payload reads; observed maximum request 4096. Exact selected payload maxChunkBytes boundary; nine carrier/XML work units accepted and eight rejected for the minimal packet. Input/count/flood limits, inexact ranges, cancellation before/after I/O and at XML work propagate. Deterministic byte mutations produce only explicit outcomes or typed resource errors. Shared XML adversarial/depth/node/namespace/entity/field tests still pass. |
| Full validation             | PASS: npm run check after all fixes: 584 tests / 23 files, strict typechecks, lint/dependency direction, formatting, builds and CLI smoke across all four launch forms. Probe stays descriptor-only. An initial cancellation test used a threshold that never fired; replaced with explicit payload-read/XML boundary cancellation. Full-check attempts caught a test-only unreachable MIME comparison and two formatting issues; corrected before the successful complete run.                                            |
| Browser/client/export       | PASS: npm run test:browser against the completed production build. Twenty-six local fixtures need no page grant/URL acquisition; ten probe plus sixteen metadata page fixtures pass with a disclosed disposable loopback grant. Discovery makes no media acquisition; each explicit selection acquires one asset. Literal Unicode/source-specific JPEG and WebP XMP cards, EXIF comparison labels, real WebP report download, clear/errors/stale selections and 320/640 layouts pass. Reviewed the 640-pixel screenshot.   |
| Independent fixtures        | PASS: node scripts/verify-webp-fixtures.mjs checks every pixel in nine WebPs using Chromium 156.0.8078.4; new fixtures are 16 × 8 gray 128, alpha 255. Supplemental host ElementTree independently checks all four direct claims and Pillow every encoded RGBA pixel in both new fixtures. No repository/CI Python dependency. Generator rerun preserves both pinned hashes.                                                                                                                                               |
| Probe stress                | PASS: npm run stress:probes -- --seed 1 --iterations 2000; 4,000 calls plus 20 controls, unchanged digest 05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8. Original probe sources and seeds untouched.                                                                                                                                                                                                                                                                                                    |
| Package                     | PASS: npm run package:extension and repeated deterministic writer produce 257,740 bytes, SHA-256 fed9da45f985ec92ef034b8ab6f1da2a4b085cbb0a8f2cff6745f06cbe717fb6. Independent PowerShell extraction confirms exactly eight expected files matching current build/guide/license hashes. Browser ran matching built code, not the extracted directory.                                                                                                                                                                      |
| Source/tree/security review | PASS: git diff --check; all 198 existing nonignored hashes unchanged through full successful validation, browser/stress/package, independent checks and generator rerun. Only this final record is edited afterward. All 31 status paths are intentional; index empty and generated outputs ignored. Limited private-key/GitHub-token/AWS-key pattern scan has no matches; not an exhaustive secret/security audit. No package/lock/core/media/manifest/acquisition/protocol/fusion changes or unexplained dependencies.   |
| Remote/native               | NOT VERIFIED for this uncommitted build: remote CI, native toolbar invocation, real activeTab grant and native Side Panel hosting. Parent JPEG XMP CI is verified for exact commit 7b87606, not these changes. Tab rendering/disposable permission do not establish native integration.                                                                                                                                                                                                                                    |

Source-level self-review found no BLOCKER/HIGH or material mismatch with this bounded plan. Reviewed complete-scanner-before-fields behavior, selected flag/unique chunk policy, preallocation checks, unchanged EXIF diagnostic/work/compatibility semantics, XML reuse, evidence states/confidence, explicit composition, text rendering, fixture independence, privacy/permissions and package contents. This remains a limited recorded-metadata inspector, not general WebP/XMP validation or authenticated history. Work is left uncommitted on codex/webp-xmp-metadata for review; no following milestone started.

## Final pre-commit source audit, 2026-10-26

The user now authorizes final audit, commit/push on codex/webp-xmp-metadata, exact-commit CI and then the next bounded milestone. This supersedes the earlier leave-uncommitted instruction for this increment only.

PASS: reviewed actual shared RIFF scanner, WebP XMP/EXIF adapters, range/error boundary, XML/RDF reader, recorded evidence factory, composition, client text rendering, tests, fixtures/generator, browser/CLI scripts, architecture/ADR/privacy/threat documentation, manifests and changed diff. No BLOCKER/HIGH finding or material mismatch with the bounded plan. Four evidence states, partial recorded claims/unassessed confidence, independent EXIF/hash and unchanged fusion remain intact. Full format/semantic conformance is not claimed.

Fresh npm run check passed (584 tests / 23 files, typechecks, boundaries/lint, formatting, builds, all four CLI launch forms). Fresh independent WebP decoding passed for all nine fixtures. Final-build browser checks passed for 26 local fixtures and 10 probe + 16 metadata page fixtures with the disclosed disposable grant. Stress seed 1 / 2000 iterations passed with the unchanged digest above. Packaging reproduced the 257,740-byte hash above; independent extraction verified exactly eight build/doc/license files. Git diff --check passed; all 198 nonignored source/doc/fixture hashes stayed unchanged through validation. Only this record is updated afterward. All 31 status paths are intentional and generated outputs ignored; limited credential-pattern scan found no matches, not an exhaustive security audit. Dependencies, lockfile, production permissions, core/probes/acquisition/protocol/fusion are unchanged.

No dependency change, so no new local npm ci; remote clean installs for this exact increment remain pending publication. Native toolbar, real activeTab and native Side Panel remain NOT VERIFIED. READY TO COMMIT within the documented subset. A subsequent milestone gets a separate plan/branch and remains uncommitted.
