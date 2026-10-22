# Phase 1: reproducible seeded probe stress

## Objective and acceptance

Add an offline developer command that applies bounded, seeded multi-edit mutations to the ten original PNG/JPEG/WebP/GIF/BMP fixtures, exercises each format probe and byte dispatch, and reproduces any case by seed and index. Run the campaign in a worker with a parent-enforced deadline so a hung parser cannot hang the developer command indefinitely.

Acceptance: deterministic case generation and replay; strict CLI limits; bounded input sizes, edit counts, reads, worker heap and campaign duration; expected media errors distinguished from unexpected failures; positive controls before mutation; useful failure diagnostics without retaining media; regression tests for replay, invalid options, unexpected errors, read guards, and worker termination; full local checks and documented CI smoke. No new production capabilities, dependencies, permissions, or format claims.

Non-goals: coverage-guided or exhaustive fuzzing, automatic minimization, external datasets, full decoding, production analyzer isolation, security certification, metadata intelligence, or publication of this increment.

## Repository/context

Start at `5d394991d1802cbec711c83981c8bc147966995c`, merged by fast-forward and pushed to `main`. Main's [Actions run 39225697849](https://github.com/mayanknandgowle/media-auth/actions/runs/39225697849) passed Linux, Windows, and browser jobs. New branch: `codex/probe-stress`. Existing baseline has 409 tests, ten original fixtures, and the finite corpus. Follow AGENTS.md and .agent/PLANS.md; leave new work uncommitted.

## Current milestone and boundaries

Test tooling only. Share the existing fixture catalog with the corpus without changing fixture bytes. Keep mutation generation and invariants in TypeScript under tests; use existing esbuild to bundle the worker in memory. A small Node CLI owns argument validation, worker lifetime, and JSON output. Production packages remain unchanged. Worker limits are a test containment aid, not a sandbox or a total-memory guarantee; Node's external buffers and parent memory are not covered by its JavaScript heap limit.

## Steps

1. [x] Verify merged main CI, inspect corpus, resource contracts, tooling, and roadmap.
2. [x] Write this plan before implementation.
3. [x] Add shared fixture loading, seeded mutation/replay, guarded probing, and worker command.
4. [x] Add behavior/security tests and bounded CI stress invocation.
5. [x] Document reproduction, limits, interpretation, and deferred work.
6. [x] Run validation, review the diff, and leave uncommitted.

## Validation

```sh
npm run check
npm run stress:probes -- --seed 1 --iterations 2000
npm run stress:probes -- --seed 4294967295 --iterations 2000
npm run stress:probes -- --seed 1 --case 37
git diff --check
```

Run the CLI in focused integration tests, including a genuinely nonterminating test worker to verify the parent deadline. Repeated seed/case output must match exactly. CI quality jobs will run a small bounded campaign. No extension behavior changes are planned; existing production code/fixtures must stay byte-identical. Dependencies do not change, so a fresh install is not required unless that changes. Remote CI for this new branch and native browser interaction are NOT VERIFIED unless actually executed.

Results on Windows, Node 24.15.0 / npm 11.15.0, 2026-10-19:

| Check                       | Result                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main merge and publication  | PASS: fast-forwarded `main` to `5d394991d1802cbec711c83981c8bc147966995c`, pushed, and verified exact-head Actions run 39225697849. Linux/Windows quality and browser jobs all succeeded before this increment began.                                                                   |
| Full validation             | PASS: final `npm run check` exited 0: strict typechecking, lint/dependency boundaries, formatting, **429 tests in 14 files**, all builds, CLI smoke through four launch forms.                                                                                                          |
| Seed 1 campaign             | PASS: 2,000 cases / 4,000 mutation calls, 42 accepted and 3,958 expected rejections, plus 20 positive controls. Digest `05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8`.                                                                                              |
| Seed 4294967295 campaign    | PASS: 2,000 cases / 4,000 mutation calls, 52 accepted and 3,948 expected rejections, plus 20 controls. Digest `34ceff5a800319edca8c6bf00b242e70bf7672b97924adcdaf0cb0ce5e0d4595`.                                                                                                       |
| CI-shaped campaign          | PASS: seed 1, 1,000 cases / 2,000 mutation calls, 28 accepted and 1,972 expected rejections. Digest `8889055e43e2ab61fbaa33265868f0fdb3f960e6e9392960b0d0085a1be8be5b`.                                                                                                                 |
| Exact replay                | PASS: seed 1 / case 37 produces two acceptances and digest `e08d90611e82f5393e8462e5660cb36d789ae5a738e37cd980f0ad9cf92ec9d0`; integration tests run it twice and pin the result. Acceptance remains a partial-probe outcome, not a decodability claim.                                 |
| Containment and error tests | PASS: truly nonterminating worker terminated; crashes, resultless exits, malformed messages, unexpected exceptions, invalid options, excessive/out-of-range reads, and swallowed guard errors reject. Cross-format splice acceptance is covered separately.                             |
| Source consistency          | PASS: all 133 nonignored files had identical SHA-256 hashes before/after final full validation and repeated 2,000-case campaigns. Only this execution record is updated afterward, with formatting/diff checks rerun.                                                                   |
| Production/dependency scope | PASS: `git diff --exit-code -- apps packages tests/fixtures package-lock.json` is empty. Dependencies are unchanged, so a fresh install was not required. No new acquisition flow, extension permission, or production worker.                                                          |
| Browser/native checks       | Fresh local browser execution and native toolbar/activeTab/Side Panel interaction are **NOT VERIFIED in this test-tooling increment**. Extension code and fixtures are unchanged; main's browser CI passed before this work.                                                            |
| New remote CI               | **NOT VERIFIED**: new work is uncommitted/unpushed. The added quality-job stress command was exercised locally.                                                                                                                                                                         |
| Working tree                | PASS: 16 intended changed/new paths; index empty; no accidental generated artifacts or unrelated files found. Existing build/dependency/browser outputs remain ignored. Credential-pattern scan of 133 nonignored files found no matches, without claiming exhaustive secret detection. |

Source/diff review found no remaining BLOCKER/HIGH finding in this scope. Reviewed bounded allocations and loop progress, replay identity, resource-policy coverage across fixtures, positive controls, independent invariants, direct/dispatched format changes, error preservation, worker cleanup/deadline behavior, and documentation limits. No parser defect was found by these finite campaigns. Branch remains `codex/probe-stress` at the merged commit; this increment is uncommitted for review. `git diff --check` passes.

## Dependencies and risks

No additions. Pin generation algorithm/version and validate seed, case, iteration, and timeout ranges. Each case must be independent of prior execution for direct replay. Keep inputs at most 16 KiB, edits at most eight, and cases at most 10,000. Use deterministic finite budgets and a separate read ceiling. A deadline failure can reflect slow infrastructure, so report it separately from parser assertions. Do not persist generated media or logs by default.

## Decisions/discoveries

- 2026-10-19: Prioritize repeatable adversarial execution over another container. Existing single-byte mutations are valuable but do not exercise combinations and insertions/deletions; the current in-process corpus cannot terminate a hung probe.
- 2026-10-19: User explicitly requested beginning the next milestone after merge CI. New implementation is authorized; committing/pushing this subsequent increment is a separate review step.
- 2026-10-19: A worker integration test exposed inherited `--input-type=module` breaking the CommonJS bundle. Explicit `execArgv: []` fixes that tested module-mode failure. Full validation also required preserving the original exception as `cause` in diagnostic errors.
- 2026-10-19: Review corrected the oracle to allow dispatch to recognize a different valid format after splicing. The direct probe must agree only when the input remains its own format; a dedicated regression prevents this false-positive failure. Resource policies cycle per fixture round, giving every format all four policies.

## Next milestones

Review this increment, then separately authorize publication. Promote any discovered parser failure into a minimized named corpus regression before expanding format support.

## Deferred research

Coverage-guided engines, sustained campaigns, automated minimization, real-world datasets with provenance, decoder differential testing, and production process isolation remain future work.

## Final source audit — 2026-10-22

Reviewed the actual generator, shared fixture catalog, guard/oracle, worker entry, parent lifecycle, CLI options, regression tests, CI configuration, and documentation. No BLOCKER/HIGH finding or material scope mismatch identified.

| Acceptance                                      | Status and evidence                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic generation and independent replay | PASS: `tests/probe-stress.ts`, `tests/probe-stress.test.ts`; golden replay and fixture immutability tests.                                                                                                                  |
| Input/edit/case/read budgets                    | PASS: generator caps and strict CLI options; guarded integer, extent, payload and read-count checks, including swallowed violations.                                                                                        |
| Worker containment and errors                   | PASS: termination of infinite JavaScript, crashes, malformed messages and resultless exits are exercised by integration tests; lifecycle clears its timer and terminates the worker. Heap limits remain explicitly partial. |
| Truthful oracle and controls                    | PASS: twenty original fixture controls; expected media errors remain distinct from unexpected failures; cross-format splice acceptance has a regression.                                                                    |
| Architecture, privacy and dependencies          | PASS: production `apps`, `packages`, fixture binaries and lockfile have no changes; no new dependency or upload/retention flow.                                                                                             |
| Validation                                      | PASS: fresh `npm run check` (429 tests / 14 files), both documented 2,000-case campaigns with matching digests, formatting and diff checks.                                                                                 |
| Working tree                                    | PASS: 16 intended paths, ignored outputs only, no credential-pattern matches among 133 nonignored files. All source bytes remained unchanged during validation.                                                             |
| Remote CI and native browser interaction        | NOT VERIFIED at pre-commit audit time. Branch publication/CI is the next authorized action; native interaction is not claimed by this tooling increment.                                                                    |

Recommendation: READY TO COMMIT. User authorized commit/push on `codex/probe-stress` and continued product work after successful CI. The prior uncommitted handoff descriptions above are historical.
