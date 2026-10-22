# Deterministic fixtures

The ten fixtures below also seed the [cross-format adversarial corpus](../../docs/PROBE_CORPUS.md). Original recipes and deterministic mutations are generated in memory during tests; their acceptance is a partial-parser result, not a decodability or authenticity label. Run `npm run test:corpus` for the focused suite.

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

Run `npm run fixture:generate` to regenerate all three images. After `npx playwright install chromium`, run `node scripts/verify-jpeg-fixtures.mjs` to independently decode both JPEGs and check every pixel with Chromium. That verifies these fixtures, not the probe's ability to establish general JPEG decodability. JPEG fixtures are used by CLI/media tests and the explicit extension fixture gallery.

## Recorded EXIF fixtures

`metadata/exif-little.jpg` and `metadata/exif-big.jpg` insert original synthetic classic TIFF EXIF into the unchanged baseline JPEG. They are separate from the ten probe-corpus seeds. Both record MediaAuth / Fixture Camera, `MediaAuth <fixture>` software, recorded dates `2026:10:22 12:34:56` and digitized `2026:10:22 12:35:00`, and MediaAuth / Fixture Lens. Little-endian orientation is 6; big-endian orientation is 1. No real device/person/location data is used. Fixtures/generator use Apache-2.0.

| File                       | Bytes | SHA-256                                                            |
| -------------------------- | ----- | ------------------------------------------------------------------ |
| `metadata/exif-little.jpg` | 435   | `b3504616bcf37c51c6e6cbf5630a2f49adbf62acb61c6338371d4b17e1eeaeca` |
| `metadata/exif-big.jpg`    | 435   | `b9f6c769bc8890fac5d9c6addb83f1123cf082898f31233826cd10d8ad88e459` |

Regenerate explicitly with `node scripts/generate-exif-fixtures.mjs`; ordinary checks consume pinned bytes. `node scripts/verify-jpeg-fixtures.mjs` decodes all four JPEGs with Chromium and checks every gray pixel. Chromium applies orientation 6 (8 × 16 display); the MediaAuth report retains encoded 16 × 8 and records orientation separately. This validates fixtures, not general EXIF/JPEG conformance. The loopback server adds only the two fixed `/metadata/*.jpg` routes; browser tests explicitly insert these controlled images into the test page.

## WebP fixtures

### Recorded WebP EXIF

`metadata/exif-little.webp` and `metadata/exif-big.webp` contain the same original synthetic nine EXIF fields described above, as raw classic TIFF in an EXIF chunk. They preserve the original lossless WebP pixels, add VP8X with the EXIF flag, and use no downloaded media or real device data. Apache-2.0 applies. They are separate from the ten probe seeds.

| File                        | Bytes | SHA-256                                                            |
| --------------------------- | ----- | ------------------------------------------------------------------ |
| `metadata/exif-little.webp` | 334   | `e4502e792dffeadc50ae5558ae1629e174be33e60172ae3a3ed81cda3689872f` |
| `metadata/exif-big.webp`    | 334   | `1bf903d607cee3c0daec9e0e7d34fc7b273bb669c26950f3256eb86fce7d7b49` |

Regenerate explicitly with `node scripts/generate-webp-exif-fixtures.mjs` using the checked-in lossless WebP and JPEG metadata seeds. Chromium fixture verification checks all pixels at 16 × 8; this pinned decoder does not apply raw-TIFF WebP orientation. Supplemental Pillow verifies the recorded orientation 6/1 and other fields independently. Fixed `/metadata/*.webp` routes and explicit local/page browser tests exercise both fixtures. Compatibility-prefix cases are synthetic in-memory test mutations, not additional claimed standard fixtures.

`lossy.webp`, `lossless.webp`, and `alpha.webp` are original generated 16 × 8 gray images, from constant RGBA canvas pixels (128,128,128,255), or alpha 128 for `alpha.webp`. They use the repository's Apache-2.0 license and contain no downloaded media or private information. The alpha fixture includes Chromium's generated color profile; it is not interpreted by the probe.

| File            | Bytes | SHA-256                                                            |
| --------------- | ----- | ------------------------------------------------------------------ |
| `lossy.webp`    | 44    | `fc3927eee0346e9c0ac714b66e4d157b7b5e15d1d1825e5f7ee301e9ea1a6d7a` |
| `lossless.webp` | 38    | `f06216831f617441ac07a9fe1f8d49f91e62526b971eee3c06933b75a3411284` |
| `alpha.webp`    | 550   | `3fa682dc8d44a3252ace27090c81b2a72e5e67ba64332c0867ea84ea5f25bd38` |

After `npx playwright install chromium`, regenerate explicitly with `node scripts/generate-webp-fixtures.mjs`. The generator uses the pinned Playwright 1.64.0 Chromium 156.0.8078.4 canvas encoder at quality 0.75 (lossy/alpha) and 1 (lossless), strips extended chunks from the two simple fixtures, and asserts the expected encoding. Byte reproducibility was checked on the validated Windows environment; different encoder/platform versions are not promised to produce identical bytes. Tests consume the checked-in bytes and CLI smoke pins their hashes; normal checks never regenerate them.

`node scripts/verify-webp-fixtures.mjs` independently decodes all three with Chromium, checks dimensions, exact alpha, exact lossless gray, and lossy gray within two levels. This validates the fixtures, not general decodability from the probe. The explicit extension fixture gallery serves these WebP assets. Malformed variants and placeholder metadata for structure tests are constructed in memory and are not labeled decodable images.

## GIF fixtures

`single87.gif` and `transparent-interlaced.gif` are original deterministic 16 × 8 checkerboards. Their two-entry palette contains gray (128,128,128) and blue (0,96,255). GIF87a uses a global palette and ordinary row order. GIF89a uses a local palette, interlaced row order, an original fixture comment, and transparency for the blue entries. Both use LZW minimum code size 2, a clear code before every literal, an end code, and payload sub-blocks of at most 17 bytes. This deliberately simple generator is not a general compressor. Fixtures and generator use the repository's Apache-2.0 license; see [GIF format acknowledgement](../../THIRD_PARTY_NOTICES.md).

| File                         | Bytes | SHA-256                                                            |
| ---------------------------- | ----- | ------------------------------------------------------------------ |
| `single87.gif`               | 135   | `53bec4343a894b85430d2c4e31e221ea2ed0a46ee79bf1a0c0178b6290079bd7` |
| `transparent-interlaced.gif` | 173   | `440c19877aafda5bcc89dd22a7cd1e7a505047845cc15ad8cefa2cabbedcba47` |

Run `node scripts/generate-gif-fixtures.mjs` explicitly to regenerate both; it uses Node byte operations without a browser encoder or downloaded media. Normal checks use the checked-in files and CLI smoke pins their hashes. After `npx playwright install chromium`, `node scripts/verify-gif-fixtures.mjs` independently decodes both with Chromium, checking dimensions and all RGBA pixels, including interlaced row placement and transparent pixels. This verifies these fixtures, not the probe's general decodability. The explicit extension fixture gallery serves both GIF assets. Structural test mutations are not asserted to be decodable images.

## BMP fixtures

`rgb24-bottom-up.bmp` and `rgb24-top-down.bmp` are original deterministic 3 × 2 RGB gradients in 24-bit BI_RGB files with 40-byte info headers. Pixels use BGR storage and three nonzero padding bytes per row. The first fixture stores rows bottom-up with an explicit image-size declaration; the second stores rows top-down with a zero image-size declaration. Both decode to the same RGB gradient: R = 40 + 60x, G = 30 + 90y, B = 200 - 40x. They contain no downloaded media or private information and use the repository's Apache-2.0 license.

| File                  | Bytes | SHA-256                                                            |
| --------------------- | ----- | ------------------------------------------------------------------ |
| `rgb24-bottom-up.bmp` | 78    | `d2ac58154b7f4dc8d4c11f341c496bfb9196bcc26008a27d9bb355e6b7ca557e` |
| `rgb24-top-down.bmp`  | 78    | `ded661978ff5d07c46a90105f5a70403d3522eec427b9bcdebefba0f116e4df2` |

Run `node scripts/generate-bmp-fixtures.mjs` explicitly to regenerate both with Node byte operations. Normal checks consume checked-in bytes and CLI smoke pins their hashes. After `npx playwright install chromium`, `node scripts/verify-bmp-fixtures.mjs` independently decodes both and checks every RGBA pixel, including row order and padding. This validates these fixtures, not general BMP decodability from the probe. The explicit extension fixture gallery serves both BMP assets.

`gallery.html`, served at `/gallery`, references all ten original fixtures for extension integration. The server has fixed routes for these known assets only; it never resolves arbitrary request paths into filesystem paths.
