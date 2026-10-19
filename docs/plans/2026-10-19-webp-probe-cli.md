# Phase 1: static WebP probing and CLI

## Objective and acceptance criteria

Add byte-signature recognition and bounded recorded dimensions for static WebP to CLI `probe` and `inspect`. Support simple VP8 and VP8L and static VP8X containers. Leave the increment uncommitted for review.

- Recognize bytes independently of filenames; preserve descriptor-only `probe` and conservative `inspect` evidence.
- Check exact RIFF extent, chunk extents/padding/count, selected header fields and reconstruction ordering, single image, and matching canvas dimensions. Reject animation and unsupported coding variants explicitly.
- Enforce input, pixel, chunk-payload, count, and range-read budgets before relevant reads/allocations. Skip compressed and metadata payloads without decoding them.
- Add original reproducible fixtures, independent browser decode checks, malformed input/boundary regression tests, and CLI smoke coverage.
- Preserve pure core/media boundaries, no new dependencies or permissions, and the PNG-only extension workflow.
- Update architecture/scope/privacy/threat documentation; run full checks and browser regression; perform final source audit. Record unexecuted checks honestly.

Non-goals: animation, full WebP bitstream validation or decoding, alpha-pixel interpretation, EXIF/XMP/ICC extraction, authenticity detection, new extension formats, publishing, commits, or pushes.

## Repository and current milestone

Starting point: clean `main` at `f23a10d870aad9fb84cbeb61f95a26f9e57f1c04`, matching `origin/main`. Work branch: `codex/webp-probe-cli`. The previous JPEG/CLI increment is complete. Node 24 / npm 11 and existing pinned TypeScript, Vitest, esbuild, and Playwright tooling remain the baseline.

This is a second bounded Phase 1 format increment, not completion of Phase 1 or the start of metadata intelligence. The existing range handles, domain descriptors, evidence pipeline, and local file boundary remain in use.

## Architecture and boundaries

Implement a host-independent WebP probe in `packages/media`, exported through its existing API and dispatched by `imageProbe`. Read only bounded headers and padding through `MediaHandle.read`. Extend the container-dimensions analyzer's MIME allowlist and version. No core or acquisition contract expansion is required. CLI still opens explicitly selected regular files; extension still invokes `pngProbe` directly. Record the format decisions in ADR 0005.

References: [WebP container](https://developers.google.com/speed/webp/docs/riff_container), [lossless header](https://developers.google.com/speed/webp/docs/webp_lossless_bitstream_specification), [VP8 RFC 6386](https://datatracker.ietf.org/doc/html/rfc6386).

## Implementation steps

- [x] Inspect repository, existing probes, CLI, constraints, roadmap, tests, and primary format references.
- [x] Select scope and write this plan before implementation.
- [x] Implement selected static WebP framing/header validation and signature dispatch.
- [x] Create original fixtures and tests, independent decode verification, CLI/analyzer coverage.
- [x] Update docs and ADR; review privacy, dependencies, and browser impact.
- [x] Run automated validation and implementation source review; record evidence.
- [x] Complete the requested final source audit in this chat; leave all changes uncommitted.

## Validation

From a checkout containing this increment, with Node 24.15.0 / npm 11.15.0:

```sh
npm ci
npm run check
npx playwright install chromium
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
npm run test:browser
git diff --check
```

Fixture regeneration and hashes are documented in `tests/fixtures/README.md`. Tests exercise valid simple/extended containers, every truncated fixture prefix, size/padding/order/flag inconsistencies, duplicates, unsupported animation, bad adapters, and resource limits. Decode verification establishes fixture correctness only, not general decodability from a successful probe.

Observed on Windows, 2026-10-19:

| Check                        | Result and evidence                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean dependency install     | PASS: `npm ci`, 144 packages installed, 150 audited, zero reported vulnerabilities. This is dependency advisory output, not a complete security audit. No manifest/lockfile change.                                                                                                                                                                                             |
| Full validation              | PASS: `npm run check` after the test lint correction; strict typechecks, ESLint/import boundaries, formatting, 184 tests across 10 files, all builds, and CLI smoke.                                                                                                                                                                                                            |
| CLI entry points             | PASS: smoke covers direct bundle, workspace alias, tracked launcher, and npm command shim; WebP descriptor, conservative analysis, and exact fixture hashes.                                                                                                                                                                                                                    |
| Fixture reproducibility      | PASS: `node scripts/generate-webp-fixtures.mjs` twice produced the documented identical hashes with Chromium 156.0.8078.4 on Windows.                                                                                                                                                                                                                                           |
| Independent fixture decoding | PASS: both `verify-jpeg-fixtures.mjs` and `verify-webp-fixtures.mjs`, using installed Chromium 156.0.8078.4; expected dimensions and pixels.                                                                                                                                                                                                                                    |
| Extension regression         | PASS: `npm run test:browser`; production extension loads and denies page access without a grant; disposable loopback-only permission copy exercises unchanged PNG discovery/selection/acquisition/analysis/rendering and stale-selection rejection.                                                                                                                             |
| Native browser interaction   | NOT VERIFIED for this increment: toolbar activation, real activeTab grant, native Side Panel hosting. Automated panel rendering does not establish these.                                                                                                                                                                                                                       |
| Remote CI                    | NOT VERIFIED for this uncommitted increment. Workflow now includes WebP fixture decoding; no push was made.                                                                                                                                                                                                                                                                     |
| Working tree                 | PASS: `git diff --check`; only intended code/tests/docs/CI and three original fixtures; package manifests/lockfile, core, and production extension manifest unchanged. Build output, dependencies, and test screenshot remain ignored. No private-key/GitHub-token/AWS-key pattern matches found in nonignored source. Pattern scanning is not proof of absence of all secrets. |

## Final source audit — 2026-10-19

Completed the final audit in the existing chat after the user selected the same-chat approach and explicitly requested the Astra / Extra High audit. No delegation was used. Reviewed the actual WebP parser, dispatch, metadata analyzer, CLI acquisition/command boundaries, core contracts/fusion, extension composition/manifest, new tests and fixture scripts, package/build/CI configuration, architecture/privacy/security documentation, ADR, and complete working diff, including untracked files. Read the original bootstrap specification completely; `MediaAuth — Greenfield Foundation — Final.md` was not available in the repository or alongside the supplied Downloads specification. Compared the selected format checks with the primary WebP/VP8 references linked above.

**Findings: no actionable finding; no remaining BLOCKER or HIGH. No material mismatch with the scoped acceptance criteria or applicable bootstrap architecture/security/evidence requirements. Recommendation: READY TO COMMIT after user review; no commit or push performed.** This is a source-level review of this increment, not a claim of full WebP conformance, exhaustive vulnerability discovery, or completion of Phase 1.

The parser's integer ranges stay within exact JavaScript arithmetic; the RIFF extent and every padded chunk are checked before payload access. Loop progress is at least eight bytes and every chunk consumes the count budget. Header allocations are constant-sized, and the metadata set has only three recognized keys. Skipped payloads are never decoded or scanned as nested chunks. Unsupported animation and coding variants cannot silently become authenticity evidence. Reserved header fields follow reader rules; strict compatibility exclusions are explicit in ADR 0005. CLI error/cleanup boundaries and exact-hash streaming remain intact. No implementation or test changes were needed during the final audit.

Fresh audit validation reran `npm ci`, the full `npm run check` (184 tests / 10 files), both fixture decoder scripts, and `npm run test:browser`, all successfully on Node 24.15.0 / npm 11.15.0 / Chromium 156.0.8078.4. The commands in the validation section reproduce the required checks. Native browser interaction and remote CI retain the NOT VERIFIED statuses above.

Additional one-off audit experiments bundled the actual TypeScript source in memory with the existing esbuild dependency, without writing fixtures or adding test files:

- Rejected 298 even-length truncated fixture prefixes after rewriting each RIFF length to match the shortened input, so the test reached internal chunk checks rather than only the outer length check.
- Exercised 3,000 deterministic single-byte mutations (1,000 per WebP fixture, seed `0x12345678`, LCG multiplier 1664525 and increment 1013904223), asserting bounded ranges/read counts, structured input errors, and bounded dimensions on success. This small mutation exercise is not sustained fuzzing.
- Probed a virtual 4,294,967,294-byte RIFF containing the lossy image and a large unknown chunk, with explicitly increased input/chunk policy limits. It returned 16 × 8 using four reads of at most 12 bytes; no large payload allocation occurred. Production defaults remain 8 MiB.
- Generated and independently decoded 16 images entirely in memory: dimensions 1 × 1, 17 × 33, 257 × 513, and 4097 × 3; canvas qualities 0.75/1 and alpha 1/0.5. Probe dimensions agreed with Chromium in every case. These are supplementary audit experiments, not additional checked-in test cases or a broad compatibility guarantee.

SHA-256 snapshots of all 104 nonignored tracked/untracked files matched before and after validation. Only this plan was subsequently updated to record the audit. `git diff --check` passes; the index is empty and HEAD remains `f23a10d870aad9fb84cbeb61f95a26f9e57f1c04`. The intended source/docs/scripts/CI changes and three documented original WebP fixtures account for the entire review diff. No accidental generated artifacts, unrelated changes, unexplained dependencies, or secret-pattern matches were found. Expected build directories, `node_modules`, and the browser test screenshot remain ignored; no claim of exhaustive secret detection is made.

| Acceptance criterion                             | Status / source evidence                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Byte recognition and descriptor-only probe       | PASS: `packages/media/src/image.ts`, `apps/cli/src/command.ts`, CLI tests and smoke.                                                                                |
| Selected static structure/header checks          | PASS: `packages/media/src/webp.ts`, structural/adversarial cases in `webp.test.ts`; strict subset documented in ADR 0005.                                           |
| Resource bounds                                  | PASS: fixed header allocations, pre-read extent/payload/count/pixel checks in `webp.ts`; skipped-payload and tiny-range tests. No hard execution isolation claimed. |
| Honest evidence                                  | PASS: descriptor limitations and `NOT_PROBED`, analyzer version 0.3.0 recorded dimensions, five `UNAVAILABLE` analyzers, unchanged conservative fusion.             |
| Original fixtures and behavior/security coverage | PASS: fixture source/hashes/independent decode plus 184 passing tests. Broader fuzzing remains deferred.                                                            |
| Architecture, privacy, dependencies, permissions | PASS: media imports core only, host-independent typecheck; no new dependencies or permissions; local selected-file acquisition; PNG-only extension.                 |
| Documentation and validation                     | PASS for executed local checks: README, architecture, privacy, threat model, roadmap, ADR, and this record agree on scope/limitations.                              |
| Final source audit in this chat                  | PASS: actual source, constraints, format references, diff, and fresh validation reviewed; no actionable findings. No sub-agent used.                                |
| Leave uncommitted                                | PASS: branch remains based on `f23a10d`; no commit, staging, or push.                                                                                               |

## Publication follow-through — 2026-10-19

After reviewing the completed audit, the user authorized committing and pushing this increment on `codex/webp-probe-cli` and verifying CI, without starting the next milestone. The original leave-uncommitted requirement was satisfied through the review and is superseded by that explicit publication request.

Before committing, the source/test/fixture snapshot still matched the final validated version; only this execution/audit record had changed. `git diff --check` passed and the remote branch did not yet exist. The audit's NOT VERIFIED remote-CI entry records its pre-publication state; the exact pushed commit and observed GitHub Actions outcome will be reported in the chat after the push. Native browser interaction remains outside that CI evidence.

## Dependencies and risks

No new runtime or development dependencies were added. Original generated fixtures use the repository's Apache-2.0 license. Partial header validation can accept invalid compressed streams; descriptors disclose that explicitly, and a regression test demonstrates this limit. VP8L's alpha-used bit is only a hint and does not become pixel evidence. Unknown/metadata chunks are bounded and skipped without interpreting contents. Reserved fields follow the specification's reader rules.

## Decisions and discoveries

- 2026-10-19: Selected static WebP after inspecting the completed JPEG increment and Phase 1 roadmap. Extension format expansion and metadata interpretation remain separate work.
- 2026-10-19: User requested Astra / High implementation and Extra High final audit. The assistant cannot change its own model/effort through an available tool. The user chose to configure this chat for the audit, declined delegation, and subsequently requested the final audit here. The audit is complete; no programmatic model-setting change is claimed.
- 2026-10-19: Chromium canvas emits extended containers with a generated color profile even for opaque images. The generator extracts the encoded image chunk for the simple lossy/lossless fixtures; the alpha fixture retains its extended container. Decoder checks and repeated generation confirm the resulting local fixture baseline.
- 2026-10-19: Initial full validation caught a test generator without `yield`; corrected it to yield only if wrongly consumed, with an explicit no-consumption assertion, then reran the complete check successfully.

## Next milestones

After review, decide the next Phase 1 format/adversarial-corpus increment. Broader metadata work requires a separate scope and plan. Do not start either within this increment.

## Deferred research

Full decode validity, worker/process isolation and hard deadlines, sustained fuzzing, animation/video/audio, camera/RAW intelligence, provenance verification, and calibrated synthetic-media analysis remain future work.
