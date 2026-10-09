# Deterministic fixture

`known.png` is an original, generated 1 × 1 RGBA PNG with a blue pixel and a `Software` text chunk. `scripts/generate-fixture.mjs` is its source; `npm run fixture:generate` regenerates it with the pinned Node baseline. No downloaded media is used.

- Length: 122 bytes.
- SHA-256: `d5947f90e10810acc699524e3da32f6fb811e27788922e7409a9dd9f9e7ab984`.
- The header probe reports 1 × 1 dimensions; text metadata is intentionally not parsed.
- The fixture's hash is byte identity, not an authenticity label. The generated origin is known through this repository's construction process, not inferred by the pipeline.

`index.html` references this one local asset. `npm run fixture:serve` exposes only the page and asset on loopback; it is not an arbitrary file server. Unit tests construct corrupt, oversized, unsupported, and truncated inputs in memory or temporary directories. Keep real sensitive files out of fixtures.
