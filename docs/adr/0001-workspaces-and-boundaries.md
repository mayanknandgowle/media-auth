# ADR 0001: Small TypeScript workspaces with host adapters

Status: Accepted — 2026-10-09

## Context

The repository starts with only Git bootstrap state. The first client is a browser extension, but future CLI/SDK/API/research clients must share domain contracts. A package for every roadmap item would create empty infrastructure and unnecessary release coordination.

## Decision

Use npm workspaces with three private packages (`core`, `media`, `analyzers`) and two apps. Node 24 / npm 11 are the development baseline. Pin tooling and commit the npm lockfile. TypeScript 5.9.3 satisfies the selected TypeScript-ESLint compatibility range; do not adopt a newer compiler solely because it is available. ESLint/Prettier/Vitest provide checks; esbuild bundles clients. No app framework, orchestrator, database, or runtime third-party dependency is required.

Domain contracts and pure orchestration live in core. Core compiles without Node/DOM libraries; dependency checks enforce allowed imports. Media probing is host independent. Native hash implementations use explicit Node/Web adapter subpaths. Workspaces export source to the internal build/test toolchain; packages remain private until an SDK release contract is designed.

Metadata/provenance/fingerprint responsibilities share an analyzers package now. Extract them when a real independent adapter/dependency or release boundary warrants it. Do not create empty services/plugins/research folders; document those boundaries instead.

## Consequences and alternatives

npm avoids requiring another package-manager bootstrap; pnpm/Turborepo could help a much larger graph but add no current need. Source exports make local iteration simple, but do not constitute a published SDK. Three packages reduce maintenance while preserving explicit interfaces. Built-in platform cryptography avoids a homegrown hash algorithm. Separate host adapters remain essential even when both clients share domain types.
