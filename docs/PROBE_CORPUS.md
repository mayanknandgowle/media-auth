# Reproducible probe regression corpus

Run `npm run test:corpus` from the repository root. The same tests run inside `npm test` and `npm run check`, including the configured Linux/Windows CI quality jobs. No browser, downloaded dataset, network access, or optional dependency is required for this suite.

The corpus is checked in as original deterministic byte recipes in `tests/probe-corpus.ts`, using the ten original [seed fixtures](../tests/fixtures/README.md). Recipes are assembled in memory, so normal validation writes no generated corpus files. Stable case names and explicit expected error codes make a failure reproducible. These are parser regression cases, not authenticity labels.

## Coverage

- **73 named cases**, each run through its format-specific probe and `imageProbe` dispatch: ten positive controls; truncated endings, trailing bytes, concatenated files, input budgets, and two-byte read budgets for every seed; format-specific CRC corruption, pixel limits, unsupported rendering/processes, malformed lengths, and floods of empty chunks/segments/comments.
- **6,156 deterministic variants** from 1,539 total seed bytes: every proper prefix, then XOR masks `0x01`, `0x80`, and `0xff` at every byte offset. Each variant runs through direct and dispatched probing (**12,312 probe calls**). The failure message includes seed, variant index, and probe ID. Prefix indices precede byte mutations; mutation index is `seedLength + 3 * byteOffset + maskIndex`.
- **78 ordered cross-format concatenations**, all expected to reject trailing data.
- PNG CRC traversal under payload/read limits of 13, 40, 65,536, and 65,537 bytes, with corruption at payload boundaries and the stored checksum. These constructed IDAT payloads are not asserted decodable.

The common test adapter rejects noninteger, negative, empty, oversized, or out-of-file reads. Every request must fit `min(64 KiB, maxChunkBytes)`. A per-invocation ceiling of `4 * inputLength + 64` reads catches unexpectedly excessive I/O. This is a deliberately generous test guard, not the production `maxChunks` definition; each format retains its documented block/marker accounting. Mutation inputs use 2 KiB total bytes, 1 KiB chunk bytes, 64 chunks, and the default pixel cap.

For known cases, the expected result is explicit and independent of parser execution. For mutations, a descriptor or `INVALID_INPUT`, `UNSUPPORTED_MEDIA`, or `RESOURCE_LIMIT` is allowed. Unexpected exceptions and guard assertions fail. Accepted descriptors must retain bounded positive dimensions, the seed MIME, acquisition context, `NOT_PROBED`, and honest limitations. Because payload decoding is deferred, an accepted mutation is not necessarily decodable or structurally valid beyond the selected checks.

## Demonstrated fixes

The initial corpus exposed PNG requests larger than a small configured `maxChunkBytes`, in both direct and dispatched probing. PNG now splits fixed-header reads and CRC scanning while preserving the chunk-payload limit and CRC coverage. The CLI's local-file adapter also now enforces `min(64 KiB, maxChunkBytes)` before allocation; a dedicated regression demonstrated that it previously allowed five bytes under a four-byte policy. Default read limits and acquisition behavior are unchanged.

The CLI regression checks that the existing PNG fixture succeeds with a 40-byte limit (its largest chunk), including the CRC type bytes, and fails with a 39-byte payload limit. The read-guard tests provide the request-level evidence.

## Limits and follow-up

This is a finite deterministic regression sweep, not coverage-guided fuzzing, differential validation against complete decoders, a CPU/memory benchmark, or a security proof. It cannot interrupt arbitrary synchronous loops or a hung adapter; production cancellation/isolation remains separately designed work. Fixtures are small and synthetic. New findings should become minimized named recipes with explicit outcomes, provenance, and budgets. Sustained fuzzing and broader format diversity remain future work.

The counts above include the [BMP increment](plans/2026-10-19-bmp-probe-cli.md). See the original [execution and validation record](plans/2026-10-19-probe-corpus-hardening.md) for observed local results and unverified remote/native-browser checks.
