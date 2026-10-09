# Licensing and third-party material

Original MediaAuth source, documentation, and the generated `tests/fixtures/known.png` are licensed under Apache-2.0. The fixture generator creates a synthetic 1 × 1 RGBA PNG; no external media, model, dataset, or pretrained weights are included. The Apache-2.0 license text in `LICENSE` is the standard license text, available from the Apache Software Foundation; no TypeScript implementation code was copied.

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
