# ADR 0008: test-only seeded probe stress worker

Status: accepted for this increment, 2026-10-19.

## Decision

Extend Phase 1 parser validation with deterministic multi-edit mutations and direct case replay. Keep all implementation under test/tooling paths. Share the original fixture catalog with the existing corpus; production media, domain contracts, CLI acquisition, and browser permissions remain unchanged.

Use the pinned esbuild to bundle a TypeScript worker in memory. The parent owns a wall-clock deadline and Node worker resource limits, terminating the worker even when parser code loops synchronously. Clear inherited Node execution flags so the CommonJS bundle has predictable module semantics. No temporary bundle or generated media is written to disk.

## Alternatives and limits

Running everything in the current test process cannot interrupt a synchronous hang. One new process per mutation is unnecessarily expensive for a bounded developer campaign. A Node worker provides a small test containment boundary with no new dependency; it does not sandbox hostile third-party code, bound native/external memory, or establish production execution isolation.

The generator is versioned and each case depends only on seed, index, and original fixtures. Expected media rejections are distinct from crashes, guard failures, missing results, and deadline expiration. Positive controls run before mutations so an always-rejecting probe cannot make the campaign pass. Direct/dispatched success must agree for the same format; a splice can legitimately change formats.

Node documents that [worker resource limits](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#new-workerfilename-options) exclude external buffers and cannot prevent a process-wide out-of-memory abort. [Worker termination](https://nodejs.org/docs/latest-v24.x/api/worker_threads.html#workerterminate) stops JavaScript execution asynchronously; the deadline is not an exact wall-clock cutoff for arbitrary native code.

## Consequences

Developers can repeat a finite campaign or a single reported case. CI runs one bounded campaign; larger/sustained coverage-guided testing, external datasets, automatic minimization, and decoder differential testing remain deferred. Neither acceptance nor a passing campaign establishes decodability or authenticity. See [command and budget details](../PROBE_STRESS.md) and the [execution plan](../plans/2026-10-19-probe-stress.md).
