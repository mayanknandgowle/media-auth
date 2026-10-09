# Foundation validation

Executed on 2026-10-09 on Windows, Node 24.15.0 / npm 11.15.0. Commands are run from the repository root. This report describes observed local results; it does not claim CI has run remotely.

| Command                           | Observed result                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm install --fetch-retries=0`   | Passed after workspace manifests existed; lockfile created; npm reported zero vulnerabilities       |
| `npm ci --fetch-retries=0`        | Passed: 144 packages installed, 150 audited; zero vulnerabilities reported                          |
| `npm run typecheck`               | Passed; includes core and media checks without Node/DOM types                                       |
| `npm run lint`                    | Passed; ESLint and package dependency checks                                                        |
| `npm run format:check`            | Passed                                                                                              |
| `npm test`                        | Passed: 92 tests across 8 files                                                                     |
| `npm run build`                   | Passed: CLI, package bundles, and extension                                                         |
| `npm run build:extension`         | Passed                                                                                              |
| `npm run smoke:cli`               | Passed: direct bundle, workspace alias, tracked launcher, npm bin, PNG/SHA-256, errors, safe import |
| `npx playwright install chromium` | Passed; pinned Chromium build downloaded                                                            |
| `npm run test:browser`            | Passed with the explicitly limited scopes below                                                     |
| `git diff --check`                | Passed; new files additionally checked against the empty baseline with `--no-index --check`         |

`npm run check` ran typecheck, lint, formatting, all tests, builds, and CLI smoke sequentially and passed. The final clean install and full check were rerun after the CLI entry/launcher and optional media-access contract corrections; all 92 tests passed. Browser smoke was rerun against the resulting extension build and passed. Initial forked Vitest workers hit Windows sandbox temporary-cache `ENOENT` failures; configuring thread workers fixed this while preserving test isolation. An initial install ran before all workspace manifests existed and failed package resolution; the complete workspace install succeeded. The first clean-install check caught an extension workspace missing from the lockfile; synchronizing the completed workspace graph resolved it, and `npm ci` then passed. Restricted DNS blocked the first registry request; install/browser download used approved network execution. Browser execution used the host Chromium cache because the Windows sandbox exposes a separate AppData directory.

## Browser results and limits

The isolated Chromium smoke actually loaded the **production** MV3 extension, confirmed its exact permission set (`activeTab`, `scripting`, `sidePanel`), verified the side-panel default path, and confirmed page access fails without the active-tab grant. No production host permission or persistent content script was added.

For the end-to-end UI test, the script made a disposable copy of the built extension with a **test-only loopback host permission**. Its unchanged panel and worker discovered the deterministic image, selected it, acquired its bytes, ran the shared probe/analyzers/fusion, and rendered the structured result. The test confirmed discovery made no additional media request, analysis fetched only the selected asset, SHA-256 matched the fixture, advanced analyzers remained unavailable, and changed/reloaded documents invalidated selections. The temporary copy/profile are removed after the test. A screenshot is generated at `test-results/extension-panel.png` (ignored by Git).

**PASS — native Chrome, separately from the automated harness:** the production build was loaded unpacked in installed Google Chrome 154.0.8037.98 on Windows and reloaded after the final build. The user completed the native folder-picker handoff after the automation tool could not target that dialog. Native UI automation then pinned MediaAuth, opened the controlled fixture, clicked the actual toolbar button, and observed the access label change from “Wants access to this site” to “Has access to this site.” Chrome opened its native Side Panel. Discovery found one image; selecting it produced a 122-byte, 1 × 1 PNG marked `ORIGINAL_WEB_ASSET`, the expected SHA-256, five unavailable advanced analyzers, and an inconclusive verdict. Panel DevTools showed zero console messages and no issues after analysis. Production permissions stayed exactly `activeTab`, `scripting`, and `sidePanel`; no host grant was added. The fixture server ran on host loopback because the sandbox-hosted server was unreachable from installed Chrome. The manual reproduction procedure is in [apps/extension/README.md](../apps/extension/README.md).

**NOT VERIFIED:** the GitHub Actions workflow on remote Linux/Windows runners. Configuration exists, but no commit was pushed or workflow dispatched.

## Architecture and security review

The final independent Astra source/specification audit found all 46 initial acceptance criteria satisfied and no remaining BLOCKER or HIGH findings. Its checklist and reproduction commands are in [FOUNDATION_AUDIT.md](FOUNDATION_AUDIT.md). The earlier CLI entry/clean-install launcher and optional media-access/provenance contract findings were corrected and covered by regressions before that review.

A separate source-only temporary copy began with neither `node_modules` nor any `dist` directory. `npm ci --fetch-retries=0` passed there, and the Windows npm command shim existed before the first build. The complete `npm run check` then passed there with 92 tests, all quality checks/builds, and the expanded CLI smoke. No Git worktree or repository history was created or changed for this test. This validates clean-checkout behavior independently of pre-existing build output.

All 62 source/configuration/fixture files matched the successful clean copy by SHA-256 after validation. The production extension files used in the native Chrome test also matched the clean copy's build byte for byte. Only the final audit/validation documentation was added or updated afterward; formatting is rechecked before staging.

The native service-worker DevTools console was also inspected and showed zero messages/no issues. It had been inactive before inspection, so this observation does not claim a preserved history of all prior worker lifetimes.

Reviewed source/dependency direction, runtime boundaries, evidence semantics, resource limits, permissions, errors, fixtures, documentation, and the Git diff. Fixed mutable registry metadata, retained limitations-array references, fallback evidence-ID collisions, missing direct-core pixel checks, incomplete hash stream chunk budgets, and Buffer-backed memory-handle aliasing. Tightened the dependency checker to parse actual TypeScript imports, including side-effect and dynamic imports. No runtime third-party dependencies, services, ML claims, broad browser hosts, or raw-media persistence were introduced.

Remaining limitations are intentional: static PNG structure only; no pixel decode or full metadata parsing; no C2PA/watermark/AI/manipulation/perceptual implementation; trusted in-process analyzers with cooperative cancellation; bounded buffered browser hashing. See [README](../README.md) and [threat model](THREAT_MODEL.md).
