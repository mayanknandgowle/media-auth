# Phase 1: bounded single-image GIF probing and CLI integration

## Objective, scope, and acceptance criteria

Add byte-signature recognition and bounded GIF87a/GIF89a single-image probing to CLI `probe` and `inspect`. Report logical-screen dimensions as recorded observations, with no decodability, transparency, animation-timing, or authenticity claim. This is the third Phase 1 increment, not completion of Phase 1.

Acceptance criteria:

- Recognize GIF from bytes, independently of filename; accept the documented single-image subset with global/local color tables, interlacing, optional graphic control, comments, and application extensions.
- Check screen/image dimensions, image bounds, palette extents, selected control fields, sub-block framing, and an exact trailer. Reject multiple images, unsupported rendering/extensions, malformed or truncated inputs, and trailing streams.
- Enforce input/pixel/count/payload budgets before work or allocation. Use fixed-size header reads; skip compressed and metadata payloads without copying them. Count top-level blocks and every sub-block, including terminators; limit aggregate payload per sub-block chain.
- Preserve pure media/core boundaries, local-file protections, deterministic evidence, `NOT_PROBED` metadata, unavailable deferred analyzers, and conservative conclusions.
- Supply original deterministic fixtures, meaningful adversarial/budget tests, CLI smoke coverage, and independent Chromium fixture decoding. Update architecture, threat/privacy documentation, attribution, and an ADR.
- Run `npm run check`, fixture decode checks, and the shared-analyzer browser regression. Record actual outcomes and any `NOT VERIFIED` checks. Leave the increment uncommitted for review.

Non-goals: LZW/pixel decoding in production, full GIF conformance, multiple-image/animation analysis, plain-text rendering, metadata extraction, new extension formats or permissions, new dependencies, Phase 2, publication, or a stable SDK.

## Repository and context

Starting point: clean `main` and `origin/main` at `cd134f0853042bfb04399edd12f4cbfc3d04a219`. Working branch: `codex/gif-probe-cli`. Existing CLI supports static PNG, selected JPEG and WebP; extension uses PNG explicitly. Existing validation has 184 tests. Follow `AGENTS.md`, `.agent/PLANS.md`, and the bootstrap architecture. Toolchain remains pinned Node 24.15.0 / npm 11.15.0 with no third-party production dependencies.

## Current milestone versus later work

Now: a small pure GIF framing/header probe and CLI integration. Later: broader containers and sustained adversarial/fuzz coverage, then separately designed metadata intelligence. Timing, looping, disposal rendering, and transparency verification are not implemented by this probe.

## Architecture and boundaries

Implement `gifProbe` inside `packages/media`; extend `imageProbe` dispatch. No domain contract or filesystem/network/browser dependency is needed. Use the existing local-file adapter. Extend the recorded-dimensions analyzer and increment its identity version to 0.4.0. The extension remains PNG-only but shares that analyzer, so its automated regression must run. Record the accepted subset and resource accounting in ADR 0006.

## Implementation steps

1. [x] Inspect rules, roadmap, probes, adapters, tests, fixture scripts, and relevant architecture/privacy/security documents. Consult the primary GIF89a specification.
2. [x] Choose the bounded increment, create its branch, and write this plan before source edits.
3. [x] Implement GIF probe, byte dispatch, and recorded-dimensions integration.
4. [x] Add original reproducible GIF fixtures, adversarial tests, CLI checks, and an independent decoder script/CI step.
5. [x] Update ADR, user documentation, threat/privacy notes, and fixture attribution.
6. [x] Validate, review source/diff and boundaries, record evidence, and leave uncommitted.

## Validation plan and evidence

Reproduce validation from the repository root with Node 24.15.0 and npm 11.15.0:

```sh
npm ci
node scripts/generate-gif-fixtures.mjs
npm run check
npx playwright install chromium
node scripts/verify-gif-fixtures.mjs
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
npm run test:browser
git diff --check
git status --short
```

Normal checks consume checked-in fixtures; generation is an explicit reproducibility check. Test all truncated fixture prefixes, malformed framing/control/palette fields, count/aggregate-payload/input/pixel limits, exact range contracts, skipped payloads, byte-signature dispatch, and conservative deterministic CLI reports. Independent native decoding validates the original fixtures only. Remote CI and native Chrome toolbar/activeTab/Side Panel behavior for this increment are **NOT VERIFIED** unless actually exercised; no push is part of this task.

Observed on Windows, 2026-10-19:

| Check                        | Result and evidence                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean install                | PASS: `npm ci`, 144 packages added / 150 audited; npm reported zero vulnerabilities. Manifests and lockfile unchanged.                                                                                                                               |
| Fixture reproducibility      | PASS: repeated `node scripts/generate-gif-fixtures.mjs` produced identical 135/173-byte files and the hashes in `tests/fixtures/README.md`.                                                                                                          |
| Full validation              | PASS: `npm run check` exited 0 after the final source/test edits: strict typechecks, ESLint, dependency boundaries, Prettier, **216 tests in 11 files**, all builds, and CLI smoke across four launch forms.                                         |
| Independent fixture decoding | PASS: JPEG, WebP, and GIF verifier scripts exited 0 using Chromium 156.0.8078.4. Both GIFs matched every intended RGBA pixel.                                                                                                                        |
| Extension regression         | PASS: `npm run test:browser` exited 0. Production MV3 loading/configuration and no-grant denial passed; the disposable loopback-permission copy exercised PNG discovery, selection, acquisition, analysis, rendering, and stale-selection rejection. |
| Tested source consistency    | PASS: SHA-256 snapshots of all **112 nonignored files** were identical before and after full validation, fixture decoding, and browser regression. Only this execution record was then updated.                                                      |
| Working tree review          | PASS: 21 intended changed/new paths, including two intentional fixture binaries. Build output, dependencies, and browser test output remain ignored. No core, production extension, manifest, or lockfile changes. `git diff --check` passed.        |
| Remote CI                    | **NOT VERIFIED** for this uncommitted increment. Workflow adds the GIF decode step; no push or remote run performed.                                                                                                                                 |
| Native browser integration   | **NOT VERIFIED** for this increment: actual toolbar activation, real activeTab granting, and native Side Panel hosting were not tested.                                                                                                              |

The browser runtime was already installed, so `npx playwright install chromium` above is setup guidance, not a freshly executed check. Linux CI uses `npx playwright install --with-deps chromium`.

Acceptance review:

| Criterion                                                 | Status and supporting paths                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Byte dispatch and documented GIF subset                   | PASS — `packages/media/src/gif.ts`, `image.ts`, `gif.test.ts`; original GIF87a/GIF89a fixtures pass direct and dispatched probing.                                                                                                                              |
| Framing, dimensions, unsupported/truncated/trailing input | PASS — `gif.test.ts` checks every truncated fixture prefix, bounds/control/palette mutations, exact trailers, and multiple-image/plain-text/unknown-extension rejection.                                                                                        |
| Resource and adapter bounds                               | PASS — `gif.ts`, `gif.test.ts`: fixed buffers/reads, aggregate payload budgets, exact block limits including terminators and empty extensions, early count rejection, skipped 25,500-byte comment contents, size/limit validation, and exact range contracts.   |
| Architecture and truthful evidence                        | PASS — unchanged core and local-file adapter; `packages/analyzers/src/index.ts` version 0.4.0 and `apps/cli/src/command.test.ts` preserve recorded canvas dimensions, `NOT_PROBED`, five unavailable analyzers, and inconclusive results. Boundary checks pass. |
| Fixtures, integration, documentation                      | PASS — generator/verifier scripts, CLI smoke, fixture hashes/attribution, ADR 0006, README, architecture, privacy, threat model, roadmap, and this record.                                                                                                      |
| Validation and review handoff                             | PASS — local checks above; no commit or push. Native browser and remote-CI gaps explicitly retained.                                                                                                                                                            |

Source/diff review found no remaining BLOCKER or HIGH finding in this increment. Reviewed loop progress/count checks, extent arithmetic, allocation/read sizes, palette and control scope, canvas-vs-image semantics, error propagation, byte-based dispatch, evidence versioning, permissions/privacy, fixture construction, and CI changes. A successful framing probe still does not promise LZW decodability or complete format conformance. This source review does not replace sustained fuzzing or future decoder isolation.

## Dependencies and risks

No dependencies changed. Fixtures and implementation are original; GIF format attribution is recorded in `THIRD_PARTY_NOTICES.md`. A partial framing parser must not be presented as a decoder. GIF can contain several rendering blocks and external palette context; this increment intentionally requires one image with an in-file active palette and rejects plain text/multiple images. Comments and application contents stay opaque. A bounded number of async reads limits parser operations but is not a hard deadline for an arbitrary adapter.

## Decisions and discoveries

- 2026-10-19: Selected GIF as the next common raster container after JPEG/WebP, using the [CompuServe GIF89a specification hosted by W3C](https://www.w3.org/Graphics/GIF/spec-gif89a.txt) as the primary format reference. Canvas dimensions and encoded image dimensions differ for subrectangles; report the logical screen and check that the sole image fits inside it.
- 2026-10-19: Use a conservative single-image subset. No LZW expansion; malformed compressed codes can still pass framing inspection. Retain `NOT_PROBED` metadata even when extension framing is inspected.
- 2026-10-19: Independent Chromium decoding confirmed both fixture constructions. The count budget includes empty extensions and terminators, and the byte budget aggregates fragmented payloads. Detailed accounting and compatibility restrictions are recorded in [ADR 0006](../adr/0006-single-image-gif-probe.md).
- 2026-10-19: Implementation and local validation complete on `codex/gif-probe-cli`; leave all changes uncommitted for review. No later milestone started.

## Next milestones

After review and separately authorized publication, choose another bounded Phase 1 format or expand the adversarial corpus. Do not start that work in this increment.

## Deferred research

Animated container semantics, isolated full decoders, sustained fuzzing, metadata parsing, provenance verification, and forensic/AI inference remain separate future work. No new capabilities in those areas are claimed.
