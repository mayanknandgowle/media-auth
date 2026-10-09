# MediaAuth

An open foundation for media authenticity, provenance, and forensic evidence. MediaAuth asks **what evidence supports a conclusion?** It is not a binary “AI detector,” and this bootstrap does not perform AI detection.

## Current status

Phase 0: a working TypeScript foundation with a local-file CLI and a Chromium Manifest V3 extension. The shared pipeline inspects bounded, static PNG containers, records header observations, computes exact SHA-256 identities, and reports deferred analyzers as `UNAVAILABLE`. The conservative conclusion is `INCONCLUSIVE` when observations exist and `UNKNOWN` when no usable evidence exists. Neither means authentic or fake.

| Workspace            | Responsibility                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/core`      | Serializable domain contracts, validated evidence, analyzer registry/execution, fusion boundary     |
| `packages/media`     | Bounded memory access and structural PNG probe                                                      |
| `packages/analyzers` | Recorded metadata, exact identity, native Node/Web hashing adapters, deferred analyzer declarations |
| `apps/cli`           | Local regular-file access and JSON commands                                                         |
| `apps/extension`     | Explicit media discovery/selection, same-origin acquisition, side panel                             |

The domain represents image, video, and audio; only static PNG inspection is implemented. See [architecture](ARCHITECTURE.md), [decisions](docs/adr/0001-workspaces-and-boundaries.md), and [roadmap](ROADMAP.md).

## Develop locally

Use Node **24.x** and npm **11.x**. Bootstrap validation used Node 24.15.0 / npm 11.15.0. Tool versions and dependencies are pinned in `package-lock.json`; no globally installed TypeScript is needed.

```sh
npm ci
npm run check
```

Individual commands: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, and `npm run smoke:cli`. Use `npm run format` to format changes. Core is also typechecked without Node or DOM libraries. CI is configured to run these checks on Linux and Windows; see the validation report for remote execution status.

Workspace packages expose TypeScript source to the internal build and test tools. They are private, unpublished packages; this milestone does not promise a distributable SDK. The clients are bundled into executable JavaScript. There are no runtime third-party dependencies in the clients.

## CLI

```sh
npm run build
node apps/cli/dist/index.js inspect tests/fixtures/known.png
node apps/cli/dist/index.js fingerprint tests/fixtures/known.png
```

After installation and build, the workspace command is also available through `npm exec -- media-auth inspect tests/fixtures/known.png`. A tracked launcher lets a clean install create the command link before build output exists. The smoke test covers direct execution, the workspace link, and the platform's npm command shim.

`inspect` probes static PNG and returns the structured analysis. `fingerprint` hashes a regular file within the byte limit; it does not measure perceptual similarity. JSON results go to stdout and JSON errors to stderr. Exit codes: `0` completed (including unavailable analyzers), `1` operational/input error, `2` usage error. There are no URL, AI-analysis, or provenance-verification commands. Symlinks and nonregular files are rejected.

## Chromium extension

```sh
npm run build:extension
npm run fixture:serve
```

1. In Chrome/Chromium 116 or newer, open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
2. Select `apps/extension/dist` from this checkout.
3. Open `http://127.0.0.1:4173/` and invoke MediaAuth from the extension toolbar.
4. In the side panel, discover media and select the known PNG.
5. Expect a 1 × 1 PNG, exact hash, recorded header observations, unavailable advanced analyzers, and an inconclusive verdict.

Only `activeTab`, `scripting`, and `sidePanel` permissions are requested. There are no blanket host permissions or always-running content scripts. Invoke the extension again after navigation if access has expired. The initial workflow handles top-frame, same-origin HTTP(S) image assets only. Cross-origin images, authenticated assets requiring cookies, redirects, blobs, SVG, JPEG, video, audio, and capture workflows are not yet supported. It does not silently substitute a screenshot.

Browser automation setup: `npx playwright install chromium`, then `npm run test:browser` after a build. See [validation](docs/VALIDATION.md) for the automated smoke scope and the separately observed native Chrome toolbar/side-panel results.

## Limits and interpretation

- Default input limit: 8 MiB; image pixel limit: 40 million; PNG/container stream chunk budget: 4,096. The extension acquisition timeout is 10 seconds.
- The PNG probe checks selected container structure and CRCs. It does **not** decompress pixels, fully validate compressed image data, or parse EXIF/XMP/IPTC/text/profile contents.
- Recorded metadata can be forged. SHA-256 proves exact byte identity, not origin, authorship, provenance, or authenticity. CRC32 is only a container integrity check.
- C2PA/provenance, watermarks, AI generation, manipulation detection, and perceptual similarity are explicitly unavailable.
- In-process analyzers are trusted code with cooperative cancellation, not sandboxed third-party plugins. Hard execution timeouts require future worker/process isolation.

## Contribute and license

Start with [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md), and [planning guidance](.agent/PLANS.md). Report security issues using [SECURITY.md](SECURITY.md); review [PRIVACY.md](PRIVACY.md) before adding acquisition or remote capabilities.

Original MediaAuth code and generated fixtures are Apache-2.0; see [LICENSE](LICENSE) and [third-party attribution](THIRD_PARTY_NOTICES.md). Dependencies, models, datasets, and future external integrations retain their own licenses.
