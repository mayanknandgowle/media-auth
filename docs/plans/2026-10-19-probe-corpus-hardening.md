# Phase 1: cross-format adversarial corpus and read-budget hardening

## Objective and acceptance

Advance Phase 1's adversarial-corpus and parser-budget exit evidence across PNG, JPEG, WebP, and GIF. Add a reproducible, named corpus built from original checked-in fixtures, exercise direct probes and byte dispatch, and correct any concrete boundary failures demonstrated by the corpus.

Acceptance:

- A common guarded range adapter checks valid integer ranges, file extents, per-read limits, and a finite test read ceiling. Known malformed, unsupported, and over-budget cases have explicit expected error codes; positive controls retain their descriptors.
- Deterministic truncation and byte mutations across every existing seed complete with a descriptor or a documented media error, never an unexpected exception or invalid range. Accepted mutations are not labeled decodable or authentic.
- Every probe respects `min(64 KiB, maxChunkBytes)` for range requests, including headers and PNG CRC scanning. Reproduce PNG's current small-read-limit failure before fixing it; retain its CRC and chunk-payload checks.
- Add CLI regression for the concrete PNG boundary, preserving existing output/evidence semantics. No new formats, metadata analysis, production dependencies, permissions, or acquisition flows.
- Run full validation and browser regression because PNG is shared with the extension; review the diff and leave both increments uncommitted.

## Starting context

Work continues on `codex/gif-probe-cli`, HEAD `cd134f0853042bfb04399edd12f4cbfc3d04a219`, with the prior GIF increment intentionally uncommitted (21 paths, 216 passing tests). Do not stage, commit, stash, reset, or discard it. Keep its execution record historical; record this increment separately. User authorized proceeding to the next increment, not publication. Follow `AGENTS.md` and `.agent/PLANS.md`.

## Current milestone and architecture

Test-side corpus builders live under `tests/` and may use Node to construct bytes. Production core/media boundaries remain unchanged. Adjust the PNG range reader/CRC traversal and CLI local-file range cap as demonstrated by regressions; retain the existing probe API, partial validation scope, chunk limits, and evidence behavior. CLI and extension continue their existing acquisition paths. No analyzer-version change is needed for enforcing an existing budget.

Current work is cross-format regression coverage and bounded reads. Broader containers, full decoding, animation, metadata intelligence, and sustained coverage-guided fuzzing remain later work. A finite mutation suite is not a security proof or exhaustive format validator.

## Steps

1. [x] Inspect repository state, rules, roadmap, all probe implementations, local-file adapter, existing tests, and workflow.
2. [x] Write this plan before edits and preserve the uncommitted GIF increment.
3. [x] Add named corpus/guarded adapter tests and reproduce the PNG read-budget failure.
4. [x] Correct demonstrated boundary failures and add CLI coverage.
5. [x] Add deterministic mutation coverage, documentation, and a focused corpus command.
6. [x] Run validation, review boundaries/source/diff, record evidence, and leave uncommitted.

## Validation

From repository root using Node 24.15.0 / npm 11.15.0:

```sh
npm ci
npm run test:corpus
npm run check
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
node scripts/verify-gif-fixtures.mjs
npm run test:browser
git diff --check
git status --short
```

Browser setup if needed: `npx playwright install chromium` (Linux CI: `npx playwright install --with-deps chromium`). The regular test suite includes the corpus, so existing CI quality jobs execute it without a separate workflow. Record named-case/mutation counts, actual results, and source consistency. Remote CI and native toolbar/activeTab/Side Panel behavior are **NOT VERIFIED** unless actually tested; no push is authorized for this increment.

Results observed on Windows, 2026-10-19, with Node 24.15.0 / npm 11.15.0:

| Check                   | Result                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Regression reproduction | PASS: original PNG failed two guarded-read cases; original CLI adapter failed the four-byte limit regression. Each failure was observed before its production fix.                                                                                                             |
| Focused corpus          | PASS: `npm run test:corpus`, 135 tests. Includes 61 named cases through two entry points, 5,532 variants / 11,064 mutation probe calls, 46 cross-format concatenations, and four PNG CRC boundary tests.                                                                       |
| Clean install           | PASS: `npm ci`, 144 packages added / 150 audited; npm reported zero vulnerabilities. Lockfile/dependencies unchanged; root manifest adds only `test:corpus`.                                                                                                                   |
| Full validation         | PASS: `npm run check` exited 0 after final source/test edits: strict typechecks, lint, dependency boundaries, formatting, **353 tests in 12 files**, all builds, and four-form CLI smoke.                                                                                      |
| Fixture checks          | PASS: all three verifier scripts independently decoded JPEG/WebP/GIF fixtures using Chromium 156.0.8078.4. No fixture regeneration or modification in this increment.                                                                                                          |
| Browser regression      | PASS: production extension loading/configuration and no-grant rejection, plus PNG workflow and stale-selection checks using the disposable loopback host grant.                                                                                                                |
| Source consistency      | PASS: all 116 nonignored files had identical SHA-256 hashes before and after full validation and browser regression. Only this execution record was subsequently updated. Prior GIF source/tests, generator/verifier, binaries, and ADR hashes match their validated versions. |
| Remote CI               | **NOT VERIFIED** for the combined uncommitted increments; no push performed. The corpus is included in existing CI through `npm run check`.                                                                                                                                    |
| Native browser UI       | **NOT VERIFIED**: actual toolbar activation, real activeTab grant, and native Side Panel hosting were not exercised.                                                                                                                                                           |

Chromium was already installed; the setup command above was not rerun. Source/diff review found no remaining BLOCKER or HIGH finding within this increment. Reviewed PNG CRC coverage and loop progress, extent checks, bounded allocations/requests, local-file checks before allocation, error behavior, test-oracle limitations, and production dependency boundaries. No core contract, analyzer, permission, or privacy-flow change was introduced by this increment.

Acceptance criteria are met by `tests/probe-corpus.ts`, `tests/probe-corpus.test.ts`, the PNG reader change, the local-file cap, and the CLI regressions. Documentation is in `docs/PROBE_CORPUS.md`, README, architecture, threat model, roadmap, and fixture notes. The combined working tree contains 28 intended changed/new paths; generated builds, browser test output, and dependencies remain ignored. No staging, commit, or push was performed.

## Dependencies and risks

No dependency additions or updates. Only original repository seed fixtures and deterministic synthetic mutations are used. Test read ceilings detect unexpected excessive I/O but do not impose production CPU deadlines or isolate hung adapters. PNG CRC scanning must still cover every type/payload byte and reject corruption across read boundaries. Preserve the 64 KiB upper bound and avoid whole-payload allocation. Small limits must fail through an explicit resource error rather than asking an adapter to exceed them.

## Decisions and discoveries

- 2026-10-19: Selected corpus/budget hardening from the Phase 1 roadmap. Four image formats now share byte dispatch; shared invariants deserve tests in addition to per-format cases.
- 2026-10-19: Source inspection shows PNG fixed-header and CRC reads are bounded at 64 KiB but do not honor smaller `maxChunkBytes`; JPEG, WebP, GIF, and dispatch already split their requests. Add evidence before changing the PNG reader.
- 2026-10-19: Keep the existing branch and uncommitted work in place. This record separates the increments without rewriting or publishing history.
- 2026-10-19: The initial corpus run had 120 passes and two failures, both PNG's two-byte read budget (direct and dispatched). Fixing header splitting and CRC traversal resolved both.
- 2026-10-19: An additional local-file regression showed `read(0, 5)` succeeded under `maxChunkBytes: 4`; the adapter capped reads at 64 KiB only. Enforce the configured minimum at the adapter before allocation. Default behavior remains capped at 64 KiB; add CLI positive/negative PNG checks to exercise both fixes together.
- 2026-10-19: Both demonstrated gaps are fixed. The final suite passes with 353 tests; the finite mutation corpus is explicitly distinguished from sustained fuzzing, full decoding, and security certification. Leave the combined work on the existing branch for review.

## Next milestones

Review the combined uncommitted work; publish only with explicit authorization. After that, separately choose the next bounded container or corpus expansion. This increment alone does not declare Phase 1 complete.

## Deferred research

Coverage-guided/sustained fuzzing, external datasets, sandboxed decoders, cancellation/isolation, animation, metadata extraction, and authenticity/provenance inference remain deferred.
