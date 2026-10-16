# MediaProbe and CLI: bounded JPEG increment

## Objective and scope

Deliver deterministic local JPEG inspection alongside existing static PNG, with explicit evidence limits. Acceptance: byte-based dispatch; 8-bit baseline/progressive JPEG dimensions and selected framing checks; a descriptor-only `probe` CLI command; `inspect` with recorded dimensions, exact identity, unavailable advanced analyzers, and conservative conclusions; generated decodable fixtures and adversarial tests; all quality gates pass.

This increment does not implement WebP, video/audio, EXIF/XMP/IPTC/ICC parsing, orientation correction, image decoding, authenticity detection, provenance verification, remote access, or expanded browser permissions/formats.

## Repository and current milestone

Start: clean `main` at `6112df6`, the committed foundation. Node 24.15.0 and npm 11.15.0 are installed. User requested the next engineering increment after foundation completion. Work on `codex/media-probe-cli`. Initially leave changes uncommitted for review. On 2026-10-16 the user explicitly authorized a final source audit, then commit and push if clean, followed by verification of CI; do not start another milestone.

## Architecture and boundaries

Retain the current core domain and resource contracts. Host-independent `packages/media` owns byte dispatch and the new JPEG parser. Existing `pngProbe` remains available; the extension retains its explicit PNG probe. CLI composes the new image probe. The container metadata adapter can report recorded dimensions for both supported formats without parsing metadata payloads. No dependencies or new packages are needed.

JPEG parsing follows the marker/frame/scan grammar in ITU-T T.81 Annex B and the byte-stuffing rules in Annex F. Bound total input, segment payloads, marker count, pixel dimensions, and individual reads. Do not decompress entropy-coded data or interpret application metadata. Fail malformed framing with `INVALID_INPUT`, unsupported processes with `UNSUPPORTED_MEDIA`, and exhausted policy budgets with `RESOURCE_LIMIT`. A successful probe does not establish full JPEG conformance, pixel decodability, metadata truth, or authenticity.

Record the design and scope in ADR 0004, updating the format scope of ADR 0003 for CLI only.

## Steps

- [x] Inspect repository, rules, source/tests, roadmap, security/privacy docs, and primary format reference; present scope before edits.
- [x] Add deterministic baseline/progressive JPEG fixture generation and expected hashes.
- [x] Add bounded JPEG probe and signature dispatcher with behavior/security regressions.
- [x] Add CLI `probe`, route `inspect`, and extend recorded dimension evidence and real executable smoke tests.
- [x] Update architecture, README, threat model, fixture docs, and ADR.
- [x] Run full validation, inspect diff and source boundaries, record results and limitations.

## Validation

Run focused media/CLI/analyzer tests during implementation, then `npm run check` and `npm run test:browser` because shared media/analyzer bundles also build for the extension. Run `npm run fixture:generate` twice and compare bytes/hashes. Independently decode generated JPEGs with the installed browser codec to verify the fixtures, without adding runtime decoder dependencies. Install dependencies with `npm ci` if dependency manifests change (none planned). Record executed commands and results here; new remote CI and native toolbar rechecks are `NOT VERIFIED` unless actually run.

### Implementation validation snapshot — 2026-10-16

| Check                                   | Result and evidence                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                         | PASS: strict root/core/media typechecks, lint/dependency boundaries, formatting, 133 tests across 9 files, all builds, executable CLI smoke. Final run followed the signature-budget correction and test formatting fix.                                                                   |
| CLI behavior                            | PASS: `apps/cli/src/command.test.ts` and `scripts/smoke-cli.mjs`; descriptor-only output, byte dispatch, recorded dimensions, expected SHA-256, five unavailable analyzers, inconclusive conclusions, structured errors, all four executable entry forms.                                  |
| Parser budgets and malformed input      | PASS: `packages/media/src/jpeg.test.ts`; every truncated fixture prefix, frame/scan errors, restart/stuffing rules, trailing streams, read contracts, byte/pixel/marker/segment/entropy limits, small dispatch read budgets.                                                               |
| Fixture regeneration                    | PASS: two consecutive `node scripts/generate-fixture.mjs` runs emitted identical hashes; existing PNG unchanged.                                                                                                                                                                           |
| `node scripts/verify-jpeg-fixtures.mjs` | PASS: Chromium 156.0.8078.4 decoded both JPEG fixtures and checked every pixel.                                                                                                                                                                                                            |
| `npm run test:browser`                  | PASS: production extension loads, declared Side Panel configuration and denied access without grant; PNG discover/select/acquire/analyze/render and stale-selection rejection using a disposable loopback host grant.                                                                      |
| Source/diff review                      | PASS for this scope: no core/extension source or manifest changes, no package manifest/lockfile changes, no new dependencies. `git diff --check` clean. Changes reviewed for bounds, truthful evidence, file lifecycle, privacy, and dependency direction.                                 |
| Working tree review                     | Only intended source, tests, generated fixture images, documentation, and fixture CI step changed. Build output, dependencies, and browser test results remain ignored. No unexpected files or common private-key/token patterns found; this is not a comprehensive secret/security audit. |
| Clean-install rerun                     | NOT VERIFIED for this increment; dependencies and lockfile are unchanged, and validation used the existing installation.                                                                                                                                                                   |
| Native browser interaction              | NOT VERIFIED for this increment: toolbar activation, real `activeTab` granting, and native Side Panel hosting were not repeated. Historical foundation verification does not establish this build's native integration.                                                                    |
| Remote Linux/Windows/browser CI         | NOT VERIFIED for this increment; changes remain uncommitted and unpushed.                                                                                                                                                                                                                  |

Reproduce from a checkout containing these changes with Node 24.x/npm 11.x:

```sh
npm ci
npm run fixture:generate
npm run fixture:generate
npm run check
npx playwright install chromium
node scripts/verify-jpeg-fixtures.mjs
npm run test:browser
git diff --check
```

On Linux, use `npx playwright install --with-deps chromium` if system browser dependencies are absent, as CI does. Compare regenerated fixture hashes against `tests/fixtures/README.md`. No source changes followed the successful full check; only this validation record was completed afterward and checked for formatting. This snapshot predates the subsequently authorized audit, commit, and push below.

## Final source audit and delivery — 2026-10-16

The user authorized final source review, commit and push if clean, and verification of CI for the pushed commit. This supersedes the initial instruction to leave the increment uncommitted. Remain on `codex/media-probe-cli`; no subsequent milestone is included.

The source audit found no remaining BLOCKER or HIGH findings and no material mismatch with this increment's scope. Review included the actual JPEG reader/parser, dispatch, CLI file lifetime/error handling, metadata adapter and fusion composition, regression tests, generated fixture construction and hashes, browser verification script, CI diff, package manifests, architecture/ADRs, threat model, privacy policy, and the original bootstrap constraints. The `Final` bootstrap document was not present in Downloads; the original bootstrap was available.

| Applicable requirement                                   | Source audit        | Evidence                                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host-independent media and core boundaries               | PASS                | `packages/media/src/jpeg.ts`, `jpeg-reader.ts`, `image.ts` import core and local modules only. Core and client platform boundaries are unchanged.                                                                                            |
| Byte identification without trusting filename            | PASS                | `image.ts`; PNG/JPEG signatures, unsupported input rejection, misleading-filename CLI regression.                                                                                                                                            |
| Bounded 8-bit baseline/progressive JPEG inspection       | PASS                | `jpeg.ts`; one supported frame, component/scan parameters, encoded dimensions, exact ending, unsupported marker/process rejection.                                                                                                           |
| Bounded allocation, reads, counts, pixels, and input     | PASS                | `jpeg-reader.ts`, `limits.ts`, `jpeg.ts`; forward reads capped at 64 KiB and custom chunk limit, small header copies, segment/entropy/marker/pixel/total limits. No entropy or metadata decoding.                                            |
| Honest limits of JPEG validation                         | PASS                | Descriptor limitations, ADR 0004, README and threat model explicitly defer table semantics, entropy validity, progressive progression, metadata and orientation.                                                                             |
| Descriptor-only probe and supported inspection           | PASS                | `apps/cli/src/command.ts`; `probe` bypasses analyzers/hash/fusion; `inspect` uses explicit registry composition.                                                                                                                             |
| File safety and error boundaries preserved               | PASS                | `apps/cli/src/local-file.ts`, `command.ts`; regular-file and size checks, change detection, final unchanged assertion, finally-close, structured errors.                                                                                     |
| Recorded observations and confidence separation          | PASS                | `packages/analyzers/src/index.ts`; recorded encoded dimensions, version 0.2.0, NOT_ASSESSED confidence, PARTIAL completeness, explicit metadata limits. Fusion and deferred analyzers are unchanged.                                         |
| Acquisition, privacy, and permissions preserved          | PASS                | Extension source/manifest and core have no diff; extension explicitly uses `pngProbe`. No new acquisition, network, telemetry, storage, or remote analyzer path.                                                                             |
| Deterministic original fixtures and adversarial coverage | PASS                | `scripts/generate-fixture.mjs`, `verify-jpeg-fixtures.mjs`, fixture README, `jpeg.test.ts`, CLI tests/smoke. Actual hashes match documentation and independent codec verification passed after clean installation.                           |
| Dependency and scope discipline                          | PASS                | No package manifest/lockfile changes, no new package, parser dependency, model, service, or framework.                                                                                                                                       |
| Working tree and staged-content hygiene                  | PASS before staging | Only planned source/tests/docs/CI and two intentional generated JPEG fixtures. No common private-key/token patterns or unexpected files found; build/test output remains ignored. This is a scoped review, not a comprehensive secret audit. |

Residual limits: this is selected structural probing, not full JPEG validation or authenticity analysis. The fixture corpus is small; complete conformance, larger corpus/fuzzing, and hard parser isolation remain deferred. Native toolbar activation, actual `activeTab` granting, and native Side Panel hosting are NOT VERIFIED for this increment. Browser harness success is limited to its disclosed disposable loopback permission.

Delivery gate: run `npm ci --fetch-retries=0`, full `npm run check`, independent fixture decode, and browser regression; review the staged tree and use a conventional commit. Push only this branch without rewriting history, then verify Linux quality, Windows quality, and browser jobs all succeed for the exact pushed SHA. Remote status is reported with the resulting Actions run link in the final delivery message; this document is the pre-push audit snapshot.

Pre-commit gate results: `npm ci --fetch-retries=0` passed (144 packages installed, 150 audited); `npm run check` passed (133 tests / 9 files, all typechecks, lint/boundaries, formatting, builds, and executable smoke); independent fixture decoding passed on Chromium 156.0.8078.4; `npm run test:browser` passed within its disclosed harness scope. Fixture SHA-256 values match their documented values. No source correction was required by this audit. Only this audit record changed after validation, and formatting/diff checks were repeated before staging. Recommendation: **READY TO COMMIT** for the scoped increment; remote CI remains a post-push gate.

## Dependencies and risks

No third-party parser/runtime dependency. JPEG has many modes and optional structures; explicitly limit support to 8-bit Huffman baseline and progressive images with one frame and up to four components. Deferred-height (DNL), arithmetic, lossless/hierarchical JPEG and trailing/concatenated streams are outside this increment. Reject unsupported structures rather than guessing. Parser work is bounded in-process; there is no hard execution timeout or third-party plugin sandbox.

## Decisions and discoveries

- 2026-10-15: choose JPEG as the first broader-media increment. Keep format-specific probes independently usable and add small explicit dispatch rather than a plugin discovery framework.
- The foundation audit report is a pre-push snapshot. Foundation commit `6112df6` subsequently passed remote Linux, Windows, and browser CI in run `37912512408`; that does not validate this new increment.
- 2026-10-16: independent Chromium 156.0.8078.4 decoding confirmed both JPEG fixtures are 16 × 8 with every pixel RGBA(128,128,128,255). The sandbox browser cache was unavailable; the check succeeded with the installed host browser. The reusable verification script is also added to the existing browser CI job; remote execution remains unverified.
- Two consecutive `node scripts/generate-fixture.mjs` executions produced identical documented SHA-256 values for all three fixtures; the existing PNG bytes were unchanged.
- Source review tightened signature dispatch to honor custom read limits below eight bytes. Regression tests cover that path. An intermediate full check stopped at formatting after test additions; formatting was corrected before the final rerun.
- No dependency manifests or lockfile changed. Full JPEG coding semantics and progressive scan progression are deliberately outside the selected framing checks and disclosed in the descriptor and ADR.

## Next milestones and deferred research

Subsequent increments may add bounded WebP/container probing, richer metadata observations, and parser fuzzing/isolation. Provenance trust policy, calibrated fusion, detectors/models, multimedia analysis, and research infrastructure remain deferred. No claim here completes every future Phase 1 format.
