# Phase 1: bounded 24-bit BMP probing

## Objective and acceptance

Add CLI byte-based probing of uncompressed 24-bit Windows BMP with exactly a 40-byte BITMAPINFOHEADER. Support positive (bottom-up) and negative (top-down) heights; return positive encoded dimensions. Validate header fields, row stride, image size and exact file extent without reading or allocating pixels. Integrate recorded dimensions, deterministic fixtures, CLI smoke, and the existing adversarial corpus.

Acceptance: byte-based recognition; explicit rejection of unsupported headers/compression/depth/palettes; safe dimension/stride arithmetic; byte/pixel/payload/block and range-read limits; exact-range adapter validation; no metadata extraction or authenticity claims; independently decoded original fixtures; meaningful malformed/budget tests; full checks and shared-analyzer browser regression. Leave uncommitted.

Non-goals: indexed/16/32-bit BMP, OS/2/V4/V5 headers, bitfields, RLE, embedded JPEG/PNG, color management or metadata extraction, new extension acquisition formats, dependencies, full format conformance, or completion of Phase 1.

## Starting repository/context

Branch `codex/gif-probe-cli`, HEAD `cd134f0853042bfb04399edd12f4cbfc3d04a219`. GIF and corpus/read-budget hardening are already uncommitted (28 paths), validated with 353 tests. Preserve their code and historical execution records; extend current documentation where appropriate. No stage, commit, push, stash, reset, or branch rewrite. Follow AGENTS.md and .agent/PLANS.md. Node 24.15.0 / npm 11.15.0 remain the pinned toolchain.

## Current milestone and architecture

New pure `bmpProbe` in media, explicit `imageProbe` dispatch, existing local-file adapter and unchanged core contracts. Container-dimensions analyzer identity becomes 0.5.0. Extension remains PNG-only, but its shared-analyzer regression must run. Test/generator scripts may use Node and Chromium; production media imports core only. Record the subset in ADR 0007.

Current work adds one tightly scoped container. Broader BMP variants, other containers, sustained fuzzing, and metadata intelligence remain later work.

## Steps

1. [x] Inspect state, repository rules, dispatch/analyzer/CLI/corpus/fixture patterns and Microsoft format references.
2. [x] Write this plan before implementation.
3. [x] Implement bounded BMP probe, dispatch, and recorded dimensions.
4. [x] Add deterministic bottom-up/top-down fixtures, adversarial and CLI/corpus tests, independent decode script and CI step.
5. [x] Update architecture, privacy/threat notes, ADR, README, roadmap, attribution, and corpus documentation.
6. [x] Validate, review source/diff, record limitations and preserve uncommitted work.

## Validation and evidence

```sh
npm ci
node scripts/generate-bmp-fixtures.mjs
npm run test:corpus
npm run check
node scripts/verify-bmp-fixtures.mjs
node scripts/verify-jpeg-fixtures.mjs
node scripts/verify-webp-fixtures.mjs
node scripts/verify-gif-fixtures.mjs
npm run test:browser
git diff --check
```

Use existing Chromium, or install with `npx playwright install chromium` (Linux CI adds `--with-deps`). Check every truncated fixture prefix, signed dimension extremes, mismatched extents, header/palette/compression exclusions, exact budgets, missing/inexact reads, and no pixel/gap reads. Independently decode all fixture pixels and verify row order/padding. Add BMP seeds to the corpus and update its counts. Remote CI and native toolbar/activeTab/Side Panel hosting remain **NOT VERIFIED** unless actually exercised. No push is authorized.

Results on Windows, 2026-10-19, Node 24.15.0 / npm 11.15.0:

- `npm ci`: PASS, 144 packages installed, 150 audited, zero reported vulnerabilities. This is package-manager output, not a security audit.
- BMP fixture regeneration: PASS, both 78-byte outputs reproduce the documented SHA-256 hashes.
- Targeted BMP/CLI/corpus tests: PASS, 216 tests. Final `npm run test:corpus`: PASS, 161 tests. Corpus now includes 73 named cases through direct and dispatched probes, 6,156 mutations through both paths (12,312 probe calls), and 78 ordered cross-format concatenations.
- `npm run check`: PASS after clean installation; typechecking including host-free core/media, lint and package dependency boundaries, formatting, **409 tests in 13 files**, all builds, and CLI smoke through all existing launch forms.
- All four independent fixture decoder scripts: PASS using Chromium 156.0.8078.4. BMP checks all six RGBA pixels for each row order and catches padded-stride mistakes. Existing JPEG/WebP/GIF pixel expectations also pass.
- `npm run test:browser`: PASS for production MV3 loading/configuration, rejection without an activeTab grant, and the production panel/worker workflow using the existing disposable loopback-only test grant. No production permission changes.
- Remote Linux/Windows CI and native toolbar activation, real activeTab granting, and native Side Panel hosting: **NOT VERIFIED for this increment**. Browser automation does not establish those native interactions.
- SHA-256 snapshots of all 124 tracked/nonignored files before and after validation match exactly. Only this execution record is updated afterward; formatting and diff checks are rerun for that documentation update.
- Source/diff review: no remaining BLOCKER/HIGH finding identified for this scope. Fixed allocations, split exact reads, signed dimension arithmetic, extent/payload/count limits, metadata uncertainty, package direction, and unsupported-format behavior match ADR 0007. Source and tests remain the basis for this assessment; passing tests are not a full conformance/security proof.
- Working-tree review: 36 modified/new paths represent the preserved GIF and corpus increments plus BMP and their documentation. No unrelated files or accidental generated artifacts found in the proposed changes. Build outputs, dependencies, and browser results remain ignored. No dependencies or lockfile changes; a credential-pattern scan of all 124 nonignored files found no matches (not a guarantee against all possible secrets).
- `git diff --check`: PASS. Branch remains `codex/gif-probe-cli`, HEAD remains `cd134f0853042bfb04399edd12f4cbfc3d04a219`, and index remains empty. Nothing staged, committed, or pushed.

## Dependencies, risks, and resource policy

No dependency changes. Original fixtures only. Fixed header buffers at most 40 bytes; range requests split by `maxChunkBytes`. Count file header, DIB header, pixel array, and optional pre-pixel gap against `maxChunks`. Bound pixel-array and gap lengths separately by `maxChunkBytes`; bound the whole file and dimensions as usual. Do not multiply large signed dimensions before checking that padded rows fit the known file extent. Optional opaque gaps are skipped; trailing bytes are rejected. Reserved fields and image-size declarations are checked. Resolution fields are not interpreted. A successful header/extent probe does not establish complete decodability or authenticity.

## Decisions and discoveries

- 2026-10-19: Selected 24-bit BI_RGB BMP as a bounded desktop-image increment. Signed height and padded-row arithmetic add useful adversarial coverage without a decoder or new domain abstraction.
- 2026-10-19: Use Microsoft [BITMAPFILEHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapfileheader), [GDI BITMAPINFOHEADER](<https://learn.microsoft.com/en-us/previous-versions/dd183376(v=vs.85)>), and [bitmap header types](https://learn.microsoft.com/en-us/windows/win32/gdi/bitmap-header-types) as primary references. The accepted subset deliberately excludes optional color tables even for 24-bit files; document this compatibility limit.

## Next milestones

Review the combined uncommitted increments and publish only with explicit authorization. Any later format, corpus expansion, or Phase 2 work requires a separate bounded increment.

## Deferred research

Full decoding, color profiles, broad BMP compatibility, animation, coverage-guided fuzzing, isolation, provenance and forensic inference remain future work.
