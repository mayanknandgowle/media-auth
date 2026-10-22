# Local image-inspection product v0.1

## Objective and acceptance

Deliver a usable Chromium image-inspection client on the existing evidence architecture. Users can explicitly select a local image or discover/select an eligible page image, inspect supported PNG/JPEG/WebP/GIF/BMP bytes locally, understand the evidence and unavailable capabilities, export a JSON report, and clear the session. Provide responsive keyboard-accessible UI, useful recovery messages, setup instructions, and end-to-end regression coverage. This is an image-inspection release with honest evidence scope; the long-term authenticity/ML/provenance roadmap remains separately designed work.

Acceptance:

- Same five byte-based formats and strict subsets in CLI and browser, retaining the existing byte/pixel/block budgets and conservative fusion.
- Local selection works without page access or added permissions, validates byte size before reading, streams under count/size/time budgets, rejects declared-size changes/inexact streams, and labels source `LOCAL_FILE`. Page acquisition remains bound to explicit opaque selections and the current document.
- Readable media facts, exact hash, evidence cards, unavailable reasons, scope/limitations, raw JSON, explicit download, and clear controls. No HTML/media rendering of untrusted content, automatic downloads, saved media/history, telemetry, or cloud requests.
- Runtime-bounded report presentation; error/empty/loading states; export enabled only for a completed current result; failed/replaced operations cannot expose a stale report; local selection serializes with page operations.
- Production extension permission/CSP boundaries remain minimal. Report export contains evidence, never raw bytes; disclose that filenames can be included. Object URLs are revoked.
- Supply a reproducible unpacked ZIP with a fixed file allowlist, license, attribution, getting-started guide and SHA-256 checksum; independently extract/check it and exercise the packaged extension.
- Unit/security tests and actual Chromium tests cover all ten fixtures, local file input without activeTab, page acquisition, report cards/download/clear, invalid/oversized files, stale selections, no passive acquisition, and responsive rendering. Run full checks and browser tests; record native UI and remote-CI limitations accurately.

## Repository/context

Start at `098d2dff39df72b3942ff3f1d574f9a7a54f5ecd` on new branch `codex/image-inspection-product`. Probe-stress was audited, committed and pushed on its own branch; [Actions run 39720124528](https://github.com/mayanknandgowle/media-auth/actions/runs/39720124528) passed Linux/Windows quality, seeded campaigns, and browser job. Main remains `5d39499`; no automatic main merge is part of this work. User explicitly authorized continued product development after CI. Existing baseline: 429 tests, five pure probes, exact native hashing, seven analyzer declarations, PNG-only extension and basic JSON UI.

## Architecture and current scope

Core/media/analyzer contracts remain reusable and host-independent. Extension workflow composes `imageProbe`; a browser-only selected-file adapter acquires bounded bytes. Local files stay in the panel and share the analysis function directly, avoiding media transfer over runtime messages or new service-worker file permissions. Page messages keep their existing exact shape. Separate a small validated report view model and DOM renderer from orchestration. Use native HTML/CSS and existing build tooling; no framework or production dependency.

Record the acquisition/export decision in ADR 0009. Product v0.1 makes existing real capabilities accessible; EXIF/XMP, credentials, watermarks, AI inference, video/audio, cross-origin/capture workflows, automatic retention and store publication remain deferred rather than fabricated.

## Steps

1. [x] Complete probe-stress audit/publication/CI; inspect extension, message boundaries, domain, tests, fixture server and docs.
2. [x] Write this plan before implementation.
3. [x] Add five-format workflow and bounded selected-file adapter with regressions.
4. [x] Build report view model, UI, export/clear and responsive states.
5. [x] Extend controlled browser tests and fixture routes; document setup/privacy/threat boundaries and ADR.
6. [x] Validate, visually inspect, review source/diff, record results, and leave product work ready for review.

## Validation

```sh
npm run check
npm run test:browser
npm run package:extension
npm run stress:probes -- --seed 1 --iterations 2000
git diff --check
```

Use checked-in original fixtures. Browser setup if missing: `npx playwright install chromium`. Inspect screenshots at desktop and narrow side-panel widths. Test real downloaded JSON, injection-like filename text, malformed/incomplete report data, oversized input before reading, exact stream size/count/time limits, and retained acquisition context. Native toolbar/activeTab/Side Panel hosting and remote CI for this uncommitted work remain NOT VERIFIED unless actually exercised.

Observed on Windows, 2026-10-22, Node 24.15.0 / npm 11.15.0:

| Acceptance/check                 | Status and evidence                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probe-stress publication         | PASS: commit `098d2df` pushed on `codex/probe-stress`; Actions run 39720124528 passed Linux/Windows quality and seeded campaigns plus the browser job. Source audit is recorded in that increment's plan.                                                                                                                                                             |
| Five-format inspection           | PASS: `workflow.ts` composes `imageProbe`; all ten original fixtures pass local-file input in the exact production extension and page input in the disclosed disposable loopback-permission copy. Original compressed bytes/fixtures and core/media/analyzer source are unchanged.                                                                                    |
| Local-file boundary              | PASS: `local-file.ts` and its tests cover early size/policy validation, exact stream size, overflow/underflow, chunk budgets/empty floods, cancellation and a genuinely hung-read deadline. Labels retain `LOCAL_FILE`. No new message for local bytes.                                                                                                               |
| Report contracts and uncertainty | PASS: `report.ts` tests reject malformed/excessive fields, evidence duplication/reference errors and malformed hashes. Seven evidence cards retain recorded observations, exact identity, five unavailable analyzers and an inconclusive baseline. JSON export round-trips the actual result.                                                                         |
| Browser UX/privacy               | PASS: local input works without activeTab and adds no image fetches; injection-like filenames remain literal text; malformed/oversized input clears prior export; actual JSON download, clear, source context, and recovery succeed. Page discovery adds no fetches, each selection adds one, and stale documents/URLs reject.                                        |
| Clear/authentication             | PASS: exact `CLEAR`/`CLEARED` messages; clear forgets worker selections without page access. Existing sender identity and all selection restrictions remain. Disabled/busy controls serialize panel operations.                                                                                                                                                       |
| Permissions/CSP                  | PASS: production Chromium manifest assertions confirm only activeTab/scripting/sidePanel, no host/content-script/external-connection permission. CSP is unchanged. No image previews, remote fonts or HTML interpolation.                                                                                                                                             |
| Visual inspection                | PASS: viewed full screenshots at 320 and 640 pixels. Browser assertion confirms no horizontal overflow at narrow width. Findings corrected: duplicate unavailable text removed and the brand avoids hash navigation that would invalidate the exact sender URL. Screenshots are ignored test artifacts, not proof of native Side Panel hosting or WCAG certification. |
| Full checks                      | PASS: final `npm run check` exited 0 after source changes: typechecking including host-free packages, lint/dependency boundaries, formatting, **445 tests / 15 files**, all builds and four-form CLI smoke.                                                                                                                                                           |
| Seeded stress                    | PASS: seed 1 / 2,000 cases, 4,000 calls plus 20 controls; digest `05ef02e9801d96bbb6cb569a02a3fe450a017f7abdc6d4caa96038f9aa20a7e8`, unchanged from the audited probes.                                                                                                                                                                                               |
| Distribution                     | PASS: `npm run package:extension`; repeated stored ZIP generation has identical bytes. Independently extracted with PowerShell Expand-Archive and compared all eight files against build/license/guide sources by SHA-256; no extra entries. Browser tests run against that extracted extension using `MEDIAAUTH_EXTENSION_PATH`.                                     |
| Artifact identity                | `dist/mediaauth-image-inspector.zip`, 167,830 bytes; SHA-256 `fd397ff488c529ab1ef7731d6d2d95b8edcdbfdf79843ac0a97c06816d25117c`. Matching `.sha256` file is supplied. This identifies the local developer distribution, not a signature/store release.                                                                                                                |
| Source consistency               | PASS: all 141 nonignored files had identical hashes before and after final full checks, packaged-browser tests and stress. Only this execution record changes afterward; its formatting/diff checks are rerun.                                                                                                                                                        |
| Dependencies/tree                | PASS: packages and lockfile unchanged, no added dependency. 28 intended modified/new paths, empty index; build, package and test output ignored. Credential-pattern scan of 141 nonignored files has no matches, without claiming exhaustive secret detection.                                                                                                        |
| Remote/native verification       | Product-branch CI, actual toolbar invocation, real activeTab granting and native Side Panel hosting remain **NOT VERIFIED** for this uncommitted increment. Probe-stress remote CI above is verified. Store signing/publication is not performed.                                                                                                                     |

Final source/diff review found no BLOCKER/HIGH issue in this release scope. Reviewed import direction, exact message shapes, input/allocation/stream budgets, state/export invalidation, DOM text rendering, report bounds, source labels, acquisition privacy, object URL cleanup, fixed package entries, and honest evidence meanings. No capability is presented as provenance/AI verification. Product source remains uncommitted on `codex/image-inspection-product`; probe-stress remains published and unchanged.

## Dependencies, limits and risks

No added dependencies. File size remains at most 8 MiB and decoded dimensions at most 40 million pixels; acquisition has a 10-second deadline and at most 4,096 chunks. Probes do not render/decompress pixels. Memory handles and native WebCrypto require bounded in-memory copies, so the byte cap is not a total-memory guarantee. A worker deadline in test tooling is not a production timeout; production analyzers remain trusted and cooperatively cancellable. A downloaded report can disclose a file label and must be an explicit user action.

## Decisions/discoveries

- 2026-10-22: Prioritize a complete user-facing local inspection workflow over more parser-only increments. Preserve pure core boundaries and the exact evidence meanings already validated.
- 2026-10-22: Explicit local input in the panel avoids filesystem/host permissions and does not need activeTab. Keep raw-file bytes outside the extension message protocol.
- 2026-10-22: Added explicit developer-distribution packaging so the product can be installed from a reviewable artifact. Use stored ZIP records with fixed timestamps/order and existing Node CRC32; no dependency additions or general archive/extraction API.
- 2026-10-22: The existing browser test read raw JSON using innerText; after putting raw JSON into an accessible collapsed details section, use textContent to inspect it. A dedicated discriminated CLEAR request also preserves TypeScript narrowing and lets users forget worker selections without activeTab.

## Next milestones and deferred work

After this release workflow is reviewable, bounded metadata intelligence and real provenance adapters require separate designs and independent fixtures. The eventual research-backed authenticity platform is broader than v0.1; no model output, verification or security certification is implied by this release.

## Final pre-commit source audit — 2026-10-22

Reviewed the source, tests, package writer, manifest/CSP, exact message/sender checks, selection lifetime, report/evidence validation, DOM rendering, export/clear states, user guide and threat/privacy documentation. Every applicable acceptance row above passes within its stated scope. No BLOCKER/HIGH finding or material specification mismatch remains. Browser File acquisition checks exact declared stream size; it is not filesystem identity attestation or a guarantee against every same-size external modification.

Fresh `npm run check` passed with 445 tests / 15 files; `npm run test:browser`, packaging, the 2,000-case seed-1 campaign and `git diff --check` passed. The ZIP hash reproduces the recorded value; independent extraction and all eight source hashes match. All 141 nonignored files remained byte-identical during validation. The credential-pattern scan found no matches; no unrelated changes or accidentally tracked generated files were found. Only this record is updated afterward. Native toolbar/activeTab/Side Panel and remote product CI remain NOT VERIFIED at audit time.

Recommendation: READY TO COMMIT. User authorized publishing this branch, verifying CI, and continuing with the next planned milestone afterward. Earlier uncommitted descriptions are historical.
