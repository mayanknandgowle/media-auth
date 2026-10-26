# MediaAuth

An open foundation for media authenticity, provenance, and forensic evidence. MediaAuth asks **what evidence supports a conclusion?** It is not a binary “AI detector,” and this bootstrap does not perform AI detection.

Install the image inspector using the [getting-started guide](GETTING_STARTED.md), or build an unpacked distribution with `npm run package:extension`. The archive is written to `dist/mediaauth-image-inspector.zip`.

## Current status

Selected JPEG, static WebP and static PNG XMP creator-tool and date claims are now reported separately from EXIF, using a bounded UTF-8 XML/RDF subset. Unknown properties are not extracted; extended packets, DTD/entity declarations and unsupported structures are inconclusive when encountered in scope. Claims do not verify editing history or authenticity. See [JPEG ADR 0014](docs/adr/0014-bounded-jpeg-xmp.md), [WebP ADR 0015](docs/adr/0015-static-webp-xmp.md), [PNG ADR 0016](docs/adr/0016-static-png-xmp.md) and the [current validation record](docs/plans/2026-10-26-png-xmp-metadata.md).

Phase 2 adds selected recorded JPEG, static WebP, and static PNG EXIF fields to `inspect` and the extension: camera/lens make/model, software, date/time strings, orientation and pixel dimensions. These are forgeable recorded claims. A separately labeled numeric comparison shows whether a complete recorded dimension pair matches encoded axes, differs, or cannot be compared. Differences may reflect legitimate JPEG padding or historical metadata; no editing or authenticity is inferred. Separate evidence states scoped absence, malformed metadata or unavailable access; dimensions stay encoded and conclusions stay conservative. See [JPEG ADR 0010](docs/adr/0010-bounded-jpeg-exif.md), [WebP ADR 0011](docs/adr/0011-static-webp-exif.md), [PNG ADR 0012](docs/adr/0012-static-png-exif.md), [comparison ADR 0013](docs/adr/0013-exif-dimension-comparison.md) and the [EXIF dimension validation record](docs/plans/2026-10-22-exif-dimension-comparison.md).

The foundation includes Phase 1 media-probing increments for local CLI inspection of static PNG/WebP, single-image GIF, 24-bit BI_RGB BMP, and 8-bit baseline/progressive JPEG. The Chromium Manifest V3 image inspector supports the same format subsets for explicitly selected local files and eligible page assets. The shared pipeline records header observations, computes exact SHA-256 identities, and reports deferred analyzers as `UNAVAILABLE`. The conservative conclusion is `INCONCLUSIVE` when observations exist and `UNKNOWN` when no usable evidence exists. Neither means authentic or fake.

| Workspace            | Responsibility                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/core`      | Serializable domain contracts, validated evidence, analyzer registry/execution, fusion boundary     |
| `packages/media`     | Bounded memory access, PNG/JPEG/WebP/GIF/BMP probes, and byte-signature dispatch                    |
| `packages/analyzers` | Recorded metadata, exact identity, native Node/Web hashing adapters, deferred analyzer declarations |
| `apps/cli`           | Local regular-file access and JSON commands                                                         |
| `apps/extension`     | Explicit local-file/page selection, bounded acquisition, evidence reports and JSON export           |

The domain represents image, video, and audio; implemented inspection covers static PNG, selected static WebP containers, single-image GIF87a/GIF89a, 24-bit BI_RGB BMP, and selected JPEG processes. See [architecture](ARCHITECTURE.md), [decisions](docs/adr/0001-workspaces-and-boundaries.md), and [roadmap](ROADMAP.md).

## Develop locally

Use Node **24.x** and npm **11.x**. Bootstrap validation used Node 24.15.0 / npm 11.15.0. Tool versions and dependencies are pinned in `package-lock.json`; no globally installed TypeScript is needed.

```sh
npm ci
npm run check
```

Individual commands: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, and `npm run smoke:cli`. Use `npm run format` to format changes. Core is also typechecked without Node or DOM libraries. CI is configured to run these checks on Linux and Windows; see the validation report for remote execution status.

Workspace packages expose TypeScript source to the internal build and test tools. They are private, unpublished packages; this milestone does not promise a distributable SDK. The clients are bundled into executable JavaScript. There are no runtime third-party dependencies in the clients.

`npm run test:corpus` runs the [cross-format adversarial corpus](docs/PROBE_CORPUS.md): named malformed/budget cases and deterministic mutations of all ten PNG/JPEG/WebP/GIF/BMP fixtures, checked through guarded range adapters. It is included in the full check. This finite regression sweep does not establish full format conformance or exhaustively test parser security.

`npm run stress:probes -- --seed 1 --iterations 2000` runs a bounded, repeatable multi-edit campaign across all five formats. Use `--seed 1 --case 37` to replay one case. A parent worker deadline catches hangs; this is test containment, not production sandboxing. See [seeded stress testing](docs/PROBE_STRESS.md).

## CLI

```sh
npm run build
node apps/cli/dist/index.js inspect tests/fixtures/known.png
node apps/cli/dist/index.js probe tests/fixtures/baseline.jpg
node apps/cli/dist/index.js inspect tests/fixtures/progressive.jpg
node apps/cli/dist/index.js inspect tests/fixtures/metadata/exif-little.jpg
node apps/cli/dist/index.js inspect tests/fixtures/metadata/exif-little.webp
node apps/cli/dist/index.js inspect tests/fixtures/metadata/exif-little.png
node apps/cli/dist/index.js inspect tests/fixtures/metadata/dimensions-different.png
node apps/cli/dist/index.js inspect tests/fixtures/metadata/xmp-attributes.jpg
node apps/cli/dist/index.js inspect tests/fixtures/metadata/xmp-attributes.webp
node apps/cli/dist/index.js inspect tests/fixtures/metadata/xmp-attributes.png
node apps/cli/dist/index.js probe tests/fixtures/lossless.webp
node apps/cli/dist/index.js inspect tests/fixtures/alpha.webp
node apps/cli/dist/index.js probe tests/fixtures/rgb24-top-down.bmp
node apps/cli/dist/index.js probe tests/fixtures/single87.gif
node apps/cli/dist/index.js inspect tests/fixtures/transparent-interlaced.gif
node apps/cli/dist/index.js fingerprint tests/fixtures/known.png
```

After installation and build, the workspace command is also available through `npm exec -- media-auth inspect tests/fixtures/known.png`. A tracked launcher lets a clean install create the command link before build output exists. The smoke test covers direct execution, the workspace link, and the platform's npm command shim.

`probe` returns a descriptor only, without analyzers, identity, or a conclusion. `inspect` probes supported PNG, WebP, JPEG, GIF, or BMP by byte signature and returns structured analysis. Filenames do not determine media type. `fingerprint` hashes a regular file within the byte limit; it does not measure perceptual similarity. JSON results go to stdout and JSON errors to stderr. Exit codes: `0` completed (including unavailable analyzers), `1` operational/input error, `2` usage error. There are no URL, AI-analysis, or provenance-verification commands. Symlinks and nonregular files are rejected.

## Chromium extension

```sh
npm run build:extension
npm run fixture:serve
```

1. In Chrome/Chromium 116 or newer, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select `apps/extension/dist` from this checkout.
3. Open `http://127.0.0.1:4173/` and invoke MediaAuth from the extension toolbar.
4. Choose a supported local image directly, or discover page media and select the known PNG.
5. Read file facts, exact hash, evidence cards, unavailable reasons and scope. Export the current report with **Download JSON report**, or use **Clear session** to forget it. The known PNG reports 1 × 1 and an inconclusive assessment.

Only `activeTab`, `scripting`, and `sidePanel` permissions are requested. There are no blanket host permissions or always-running content scripts. Invoke the extension again after navigation if access has expired. Page acquisition handles top-frame, same-origin HTTP(S) image assets. Local-file inspection needs no page access. Supported container subsets match the CLI. Cross-origin page acquisition, authenticated assets requiring cookies, redirects, blob/data URLs, SVG, video, audio, and captures remain unsupported. It does not silently substitute a screenshot.

Browser automation setup: `npx playwright install chromium`, then `npm run test:browser` after a build. See [validation](docs/VALIDATION.md) for the automated smoke scope and the separately observed native Chrome toolbar/side-panel results.

See the current [image-inspection product record](docs/plans/2026-10-22-image-inspection-product.md) for local-file input, report export and browser validation. Historical parser records: [JPEG/CLI record](docs/plans/2026-10-15-media-probe-cli.md), [WebP/CLI record](docs/plans/2026-10-19-webp-probe-cli.md), [GIF/CLI record](docs/plans/2026-10-19-gif-probe-cli.md), and current [BMP/CLI execution and validation record](docs/plans/2026-10-19-bmp-probe-cli.md). `node scripts/verify-jpeg-fixtures.mjs`, `node scripts/verify-webp-fixtures.mjs`, `node scripts/verify-gif-fixtures.mjs`, and `node scripts/verify-bmp-fixtures.mjs` independently decode the original fixtures with Chromium; CI's browser job is configured to run all four. Fixture decoding is not a general decodability guarantee from the probes.

## Limits and interpretation

- Default input limit: 8 MiB; image pixel limit: 40 million; PNG/WebP chunk / JPEG marker / GIF block and sub-block / BMP block / stream chunk budget: 4,096. The extension acquisition timeout is 10 seconds.
- The PNG probe checks selected container structure and CRCs. It does **not** decompress pixels, fully validate compressed image data, or parse EXIF/XMP/IPTC/text/profile contents.
- The JPEG probe supports one 8-bit baseline/progressive frame with up to four components. It checks selected marker/frame/scan structure, not coding tables, entropy validity, or full format conformance. Dimensions are encoded dimensions; metadata orientation is not applied. Unsupported JPEG processes, deferred height, and trailing streams are rejected.
- The WebP probe checks selected static RIFF/chunk and VP8/VP8L/VP8X headers, encoded dimensions, and reconstruction order. Animation, scaled VP8 frames, duplicate metadata, and trailing data are rejected. Compressed pixels, alpha data, and metadata payloads are not decoded; transparency hints are not verified. See [ADR 0005](docs/adr/0005-static-webp-probe.md) for the accepted subset. None of these probes establishes decodability or authenticity.
- JPEG EXIF inspection reads selected classic TIFF ASCII fields and orientation from one pre-scan APP1 block. GPS, owner/serial, maker notes, thumbnails, XMP/IPTC/ICC and post-scan metadata are not extracted. Malformed/ambiguous fields are inconclusive; dates remain strings and orientation is not applied. No pre-scan EXIF is scoped absence, never authenticity. CLI `probe` does not run this analyzer; its `NOT_PROBED` descriptor stays unchanged.
- Static WebP EXIF inspection searches the exact RIFF extent and reads one bounded raw-TIFF EXIF chunk. One nonstandard Exif prefix is accepted only with an explicit compatibility limitation. Missing EXIF, malformed/ambiguous metadata, and unavailable reads remain distinct; encoded dimensions and fusion are unchanged.
- PNG eXIf inspection validates selected static framing and every chunk CRC, retaining at most 64 KiB of raw-TIFF bytes before IDAT. Corrupt/ambiguous carriers are inconclusive, while absence has an explicit scope. Pixels/opaque metadata are not decompressed or interpreted; CRC does not establish authenticity.
- Recorded metadata can be forged. SHA-256 proves exact byte identity, not origin, authorship, provenance, or authenticity. CRC32 is only a container integrity check.
- The GIF probe checks selected single-image framing, palette extents, and image bounds, reporting logical-screen dimensions. It rejects multiple images, plain-text rendering, unsupported extensions, and trailing streams. LZW pixels and extension contents are not decoded; transparency, timing, looping, and disposal rendering are not verified. Pixel aspect ratio is not applied. See [ADR 0006](docs/adr/0006-single-image-gif-probe.md) for the subset and block/payload budgets.
- The BMP probe accepts uncompressed 24-bit images with the 40-byte Windows header. It checks signed dimensions and padded-row extents, without interpreting pixels, gaps, or resolution metadata. Other headers, depths, compression, and color-table declarations are unsupported. See [ADR 0007](docs/adr/0007-24-bit-bmp-probe.md).
- C2PA/provenance, watermarks, AI generation, manipulation detection, and perceptual similarity are explicitly unavailable.
- In-process analyzers are trusted code with cooperative cancellation, not sandboxed third-party plugins. Hard execution timeouts require future worker/process isolation.

## Contribute and license

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), and [planning guidance](.agent/PLANS.md). Report security issues using [SECURITY.md](SECURITY.md); review [PRIVACY.md](PRIVACY.md) before adding acquisition or remote capabilities.

Original MediaAuth code and generated fixtures are Apache-2.0; see [LICENSE](LICENSE) and [third-party attribution](THIRD_PARTY_NOTICES.md). Dependencies, models, datasets, and future external integrations retain their own licenses.
