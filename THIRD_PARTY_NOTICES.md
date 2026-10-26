# Licensing and third-party material

Original MediaAuth source, documentation, and generated PNG/JPEG/WebP/GIF/BMP fixtures are licensed under Apache-2.0. See [fixture construction and hashes](tests/fixtures/README.md). No external media, model, dataset, or pretrained weights are included. The Apache-2.0 license text in `LICENSE` is the standard license text, available from the Apache Software Foundation; no TypeScript implementation code was copied.

The Graphics Interchange Format is the copyright property of CompuServe Incorporated; GIF is a service mark of CompuServe Incorporated. This acknowledgement follows the [format specification's attribution provision](https://www.w3.org/Graphics/GIF/spec-gif89a.txt). The GIF probe and fixture generator are original implementations; the specification and third-party decoder code are not redistributed here.

JPEG/WebP/PNG EXIF readers and synthetic metadata fixtures are original Apache-2.0 material. Publisher format references are linked in [ADR 0010](docs/adr/0010-bounded-jpeg-exif.md), [ADR 0011](docs/adr/0011-static-webp-exif.md) and [ADR 0012](docs/adr/0012-static-png-exif.md); no EXIF specification or third-party parser is redistributed.

The limited JPEG/WebP/PNG XMP/XML readers and fixtures are also original Apache-2.0 code/material. Standard UTF-8 TextDecoder belongs to the runtime; no external XML parser or Adobe SDK is bundled. Publisher references in [ADR 0014](docs/adr/0014-bounded-jpeg-xmp.md), [ADR 0015](docs/adr/0015-static-webp-xmp.md) and [ADR 0016](docs/adr/0016-static-png-xmp.md) are not redistributed.

There are currently no third-party runtime dependencies bundled into the CLI or extension. The build uses native Node cryptography and browser WebCrypto. Development tooling remains separately licensed:

| Dependency                            | License    |
| ------------------------------------- | ---------- |
| TypeScript                            | Apache-2.0 |
| ESLint, @eslint/js, typescript-eslint | MIT        |
| Prettier                              | MIT        |
| Vitest                                | MIT        |
| esbuild                               | MIT        |
| @types/node, @types/chrome            | MIT        |
| @playwright/test                      | Apache-2.0 |

See `package-lock.json` for the precise direct/transitive dependency graph and each installed package's license/notice files for its applicable terms. Playwright's downloaded browser and associated binaries carry their own notices; they are test dependencies and are not redistributed with MediaAuth source.

Future integrations, model weights, research code, datasets, and proprietary services require separate provenance, usage-rights, redistribution, and attribution review. Do not assume Apache-2.0 applies to those assets.
