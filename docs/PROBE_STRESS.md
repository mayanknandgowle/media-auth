# Seeded probe stress

This offline developer command complements the named [regression corpus](PROBE_CORPUS.md). It mutates only the ten original repository fixtures, probes each generated input directly and by byte signature, and fails on unexpected exceptions, invalid descriptors, range violations, or a worker deadline. It is not a full decoder, a security certification, or coverage-guided fuzzing.

From the repository root after `npm ci`:

```sh
npm run stress:probes
npm run stress:probes -- --seed 1 --iterations 2000
npm run stress:probes -- --seed 4294967295 --iterations 2000
npm run stress:probes -- --seed 1 --case 37
```

The default is seed 1, 1,000 cases, and a 30-second worker deadline. Options accept decimal integers: `--seed` 0..4294967295, `--iterations` 1..10000, `--case` 0..999999, and `--timeout-ms` 100..120000. `--case` runs one case and cannot accompany `--iterations`. Unknown, missing, duplicate, fractional, negative, and out-of-range values fail before worker startup. Exit codes are 0 for success, 1 for stress failure, and 2 for invalid arguments. JSON results go to stdout; errors go to stderr. The npm wrapper also prints its normal command banner.

## Generation and replay

Algorithm version 1 uses a fixed 32-bit PRNG initialized independently from the campaign seed and case index. Fixture selection cycles through the shared catalog; resource policies change every fixture cycle so each fixture encounters every policy. Each case applies one to eight operations: bit flips, short field overwrites, insertions, deletions, truncations, and repeated/spliced seed data. Some operations can leave bytes unchanged. All generated inputs are at most 16 KiB. Mutation buffers live only in memory and are not persisted or uploaded.

Each campaign first validates all ten original fixtures through both entry points. It reports 20 positive controls separately from mutation probe calls. Successful output includes the algorithm version, seed, starting index, iteration count, accepted/rejected call counts, and a SHA-256 digest of ordered case identities, byte hashes, limits, and outcomes. The digest describes this test run, not media authenticity. Exact replay requires the same code, fixture bytes, catalog order, and algorithm version; it is not a promise that future parser fixes preserve outcomes.

Unexpected per-case failures include seed, index, fixture name, and generated-byte hash. Reproduce with `--seed S --case N`. A deadline reports the most recently received case index, or startup/positive controls; that index is a diagnostic hint, not proof of a reproducible parser hang. Retry the exact case with an appropriate deadline to separate infrastructure slowness from parser behavior. Promote confirmed defects to minimized named regressions; automatic minimization is not implemented.

## Oracle and containment limits

Expected rejection codes are `INVALID_INPUT`, `UNSUPPORTED_MEDIA`, and `RESOURCE_LIMIT`. Any other exception fails. Accepted descriptors must have bounded positive dimensions, correct acquisition context and byte size, `NOT_PROBED`, range-only access, no computed hash, and explicit limitations. Direct and dispatched acceptance must agree for the original format. A splice may form a different format, which dispatch may legitimately recognize.

The range guard checks integer offsets/lengths, exact file extents, reads no larger than `min(64 KiB, maxChunkBytes)`, and a per-probe ceiling of `4 * inputLength + 64`. A caught-and-masked guard violation still fails. Policies exercise 512-byte or 16-KiB file limits, 64-pixel or default pixel limits, two-byte or 4-KiB chunk limits, and 8- or 256-block limits. Count semantics remain format-specific.

The parent starts one Node worker, bundles it in memory with the already pinned esbuild, and terminates it on completion, error, or deadline. Its V8 limits are 64 MiB old generation, 16 MiB young generation, and 4 MiB stack. These **do not bound total process memory or external/native buffers** and are not a security sandbox. The deadline covers worker execution, including controls and startup; dependency installation and bundling occur before it. Production probes/analyzers are unchanged and retain their existing cancellation limits.

CI quality jobs run a bounded seed-1 campaign after the full checks on Linux and Windows. Unit/integration tests cover replay, input limits, unexpected errors, masked range violations, malformed worker messages, crashes, exit without a result, and termination of a truly nonterminating worker. Remote CI for an uncommitted change remains unverified. See the [execution record](plans/2026-10-19-probe-stress.md).
