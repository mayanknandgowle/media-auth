# Deterministic fixtures

`known.png` is an original, generated 1 × 1 RGBA PNG with a blue pixel and a `Software` text chunk. `scripts/generate-fixture.mjs` is its source; `npm run fixture:generate` regenerates it with the pinned Node baseline. No downloaded media is used.

- Length: 122 bytes.
- SHA-256: `d5947f90e10810acc699524e3da32f6fb811e27788922e7409a9dd9f9e7ab984`.
- The header probe reports 1 × 1 dimensions; text metadata is intentionally not parsed.
- The fixture's hash is byte identity, not an authenticity label. The generated origin is known through this repository's construction process, not inferred by the pipeline.

`index.html` references this one local asset. `npm run fixture:serve` exposes only the page and asset on loopback; it is not an arbitrary file server. Unit tests construct corrupt, oversized, unsupported, and truncated inputs in memory or temporary directories. Keep real sensitive files out of fixtures.

## JPEG fixtures

`baseline.jpg` and `progressive.jpg` are original generated 16 × 8 grayscale images, all pixels 128. The same generator writes minimal 8-bit Huffman JPEG streams with one component, constant quantization, and category-zero / end-of-block codes. Baseline uses a single scan; progressive uses separate DC and AC scans. These files contain no external media or private metadata and share the repository's Apache-2.0 license.

| File              | Bytes | SHA-256                                                            |
| ----------------- | ----- | ------------------------------------------------------------------ |
| `baseline.jpg`    | 155   | `54264ccfe6f621aa45c147b6ac4f6b829ad7165545cf2e1a27a06e0be515775d` |
| `progressive.jpg` | 166   | `f221219ce29cf87f8933a6f758c344ca94aa5f7524ae74943210b119f7be0b8e` |

Run `npm run fixture:generate` to regenerate all three images. After `npx playwright install chromium`, run `node scripts/verify-jpeg-fixtures.mjs` to independently decode both JPEGs and check every pixel with Chromium. That verifies these fixtures, not the probe's ability to establish general JPEG decodability. JPEG fixtures are for CLI/media tests and are not added to the extension fixture server.

## WebP fixtures

`lossy.webp`, `lossless.webp`, and `alpha.webp` are original generated 16 × 8 gray images, from constant RGBA canvas pixels (128,128,128,255), or alpha 128 for `alpha.webp`. They use the repository's Apache-2.0 license and contain no downloaded media or private information. The alpha fixture includes Chromium's generated color profile; it is not interpreted by the probe.

| File            | Bytes | SHA-256                                                            |
| --------------- | ----- | ------------------------------------------------------------------ |
| `lossy.webp`    | 44    | `fc3927eee0346e9c0ac714b66e4d157b7b5e15d1d1825e5f7ee301e9ea1a6d7a` |
| `lossless.webp` | 38    | `f06216831f617441ac07a9fe1f8d49f91e62526b971eee3c06933b75a3411284` |
| `alpha.webp`    | 550   | `3fa682dc8d44a3252ace27090c81b2a72e5e67ba64332c0867ea84ea5f25bd38` |

After `npx playwright install chromium`, regenerate explicitly with `node scripts/generate-webp-fixtures.mjs`. The generator uses the pinned Playwright 1.64.0 Chromium 156.0.8078.4 canvas encoder at quality 0.75 (lossy/alpha) and 1 (lossless), strips extended chunks from the two simple fixtures, and asserts the expected encoding. Byte reproducibility was checked on the validated Windows environment; different encoder/platform versions are not promised to produce identical bytes. Tests consume the checked-in bytes and CLI smoke pins their hashes; normal checks never regenerate them.

`node scripts/verify-webp-fixtures.mjs` independently decodes all three with Chromium, checks dimensions, exact alpha, exact lossless gray, and lossy gray within two levels. This validates the fixtures, not general decodability from the probe. No WebP is added to the extension fixture server. Malformed variants and placeholder metadata for structure tests are constructed in memory and are not labeled decodable images.
