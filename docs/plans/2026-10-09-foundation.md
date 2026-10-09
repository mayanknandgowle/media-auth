# Phase 0 foundation ExecPlan

## Objective and scope

Implement the user-authorized “MediaAuth — Greenfield Foundation Bootstrap” specification, read in full before edits. Deliver a usable evidence-first TypeScript monorepo, CLI, MV3 extension foundation, deterministic fixtures, security tests, documentation, and actual validation. No models, cloud services, broad parsers, fabricated verification, or polished UI.

## Starting context

2026-10-09: clean `main`, commit `2e5332f`, only `.gitkeep`. Node 24.15.0 and npm 11.15.0 available. Preserve current checkout/history. A concise implementation plan was presented before major edits. Work was split across core/tooling/docs, media/analyzers, CLI, and extension scopes.

## Architecture and decisions

- npm workspaces, TypeScript 5.9, ESLint, Prettier, Vitest, esbuild; no runtime third-party dependencies.
- Three packages only: `core`, `media`, `analyzers`. CLI and extension own host access. Planned standalone provenance/metadata/fingerprint packages are consolidated until independent responsibilities justify extraction.
- Core evidence/status/quality/confidence/media/provenance contracts; injected registry/fusion; honest unavailable analyzers.
- Bounded static PNG probe, native SHA-256, recorded header metadata. Strict top-frame same-origin extension selection.
- [ADR 1](../adr/0001-workspaces-and-boundaries.md), [ADR 2](../adr/0002-evidence-and-baseline.md), [ADR 3](../adr/0003-acquisition-and-parser-scope.md).

## Steps and progress

- [x] Read complete specification; inspect Git, runtimes, and files; present concise plan.
- [x] Establish tooling, package/domain contracts, and source dependency boundaries.
- [x] Implement bounded probing, native hashing, registry/fusion, deferred capability reporting.
- [x] Implement local CLI and MV3 discovery/acquisition/panel.
- [x] Create deterministic PNG/test page and behavioral/security tests.
- [x] Write contributor, architecture, privacy/security, license, ADR, roadmap, and planning documentation.
- [x] Finish clean install, quality gates, builds, CLI/browser checks; capture exact results and explicit native browser UI limitations.
- [x] Review architecture/diff; fix findings and leave uncommitted changes on `main` ready for review.
- [x] Correct the final audit findings: npm-linked CLI entry and clean-install launcher; optional media access and associated provenance contracts.
- [x] Repeat clean install and full validation after corrections; verify the actual Chrome toolbar/native Side Panel flow.
- [x] Complete independent Astra source review and a source-only clean-install/full-check gate; verify tested source and native extension build match the final implementation.
- [x] Review the staged diff and approve the foundation for the user-authorized commit on `main` after all local gates pass.

## Validation strategy

Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run build:extension`, `npm run smoke:cli`, and `npm run test:browser` where practical. Test evidence distinctions, native hash vectors, registry failures, deterministic output, malformed/oversized input, URL/message trust boundaries, stale selections, and actual client composition. Record final results in [VALIDATION.md](../VALIDATION.md); never equate harness permissions with production toolbar-granted access.

## Risks, discoveries, and deviations

- Registry access initially failed inside the restricted network; approved network execution installed pinned dependencies. Latest TypeScript was newer than typescript-eslint's supported range; selected stable compatible TypeScript 5.9.3.
- The in-app browser connector failed during bootstrap. Use an isolated Playwright Chromium profile for browser tests; document any genuine toolbar/side-panel checks still unverified.
- Native WebCrypto requires a bounded full buffer; Node hashing streams. Core handles support streaming for future large media even though this milestone caps input at 8 MiB.
- In-process analyzers are trusted code and cancellation is cooperative; strict deadlines/isolation are deferred, not claimed.
- Final suite: 92 passing tests after audit corrections. Thread workers avoid Windows sandbox forked-worker temporary-cache failures. Clean install initially caught a missing extension workspace in the lockfile; synchronized and passed.
- Production extension loads in Chromium; automated integration passes with a disposable loopback host grant. Separately, installed Chrome 154 passed the actual toolbar/activeTab transition, native Side Panel, discovery, selection, and analysis flow using the unchanged production permissions. Panel DevTools showed zero console messages and no issues; see validation report. Remote CI remains `NOT VERIFIED` until an authorized push and successful runs.
- Final reviews fixed registry metadata mutation, evidence ID collisions, limitations aliasing, direct descriptor pixel budgets, hash stream chunk limits, and Buffer snapshot aliasing; no fake verification or authenticity inference was added.
- Header observation does not prove metadata truth or image decode validity. PNG structure checks are intentionally limited; no inflated parsing.
- The final pre-commit audit exposed a CLI symlink entry guard that returned no output through npm's command. Resolve the real entry path and provide a tracked launcher so a clean install can create its bin link before building. Expanded smoke coverage exercises the real platform command.
- Section 10 requires optional byte access and provenance association. Descriptors now support metadata-only input and unknown size; handles independently offer range/stream access, while current bounded adapters retain known-size replayable streams. Associated provenance cannot change the conservative conclusion by itself.

## Next milestones

Broaden MediaProbe and CLI with deterministic fixtures; add parser fixture/fuzz coverage; add richer bounded metadata observations; integrate genuine provenance verification and an explicit trust policy; isolate analyzer execution before third-party or expensive parsers. No next milestone begins as part of this final audit.

## Deferred research and ideas

Calibration, evidence fusion research, robust synthetic/manipulation detection, multimedia localization, models/datasets, and evidence graphs remain aspirational. See [research boundaries](../RESEARCH.md) and [ROADMAP.md](../../ROADMAP.md).
