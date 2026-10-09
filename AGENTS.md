# Engineering rules

- Preserve user work and Git history. Work on the user's requested branch; otherwise use `codex/` branches. Use conventional commits only after validation. Never push without authorization.
- Read relevant source and docs before editing. For substantial work, follow `.agent/PLANS.md` and maintain an ExecPlan in `docs/plans/`.
- Core stays independent of Node, DOM, Chrome, UI, filesystem, network, and ML frameworks. Keep adapters at package/client boundaries; enforce dependency direction.
- Evidence is central. Keep `DETECTED`, `NOT_DETECTED`, `UNAVAILABLE`, and `INCONCLUSIVE` distinct. Missing/unavailable observations never establish authenticity. Metadata is recorded information, not ground truth.
- Keep detector confidence, evidence quality/reliability, provenance trust, and conclusion confidence separate. Analyzers return evidence; only explicit fusion policies derive conclusions.
- Never fake verification, detection, watermarks, model output, or available capabilities. Document deferred work as deferred.
- Treat media and messages as untrusted. Enforce input, allocation, count, pixel, and execution budgets at each adapter. Do not introduce arbitrary URL fetching or unsafe file access.
- Acquire only explicitly selected media. No passive inspection, telemetry, retention, or remote uploads by default. Distinguish original assets, blobs, captures, and local files.
- Use strict TypeScript, discriminated unions, runtime boundary validation, small modules, and explicit composition. Avoid `any`, unchecked casts, hidden singletons, and premature abstractions.
- Add behavior and security regression tests for meaningful changes. Use deterministic fixtures; do not require external websites for foundational tests.
- Keep dependencies few and pinned; inspect licenses and runtime impact. Update the lockfile. Do not add empty packages/services for future ideas.
- Run `npm ci` when dependencies change; run `npm run check` before completion and `npm run test:browser` for extension changes where available. Label unexecuted checks `NOT VERIFIED` and explain why.
- Review the diff for architecture, errors, permissions, privacy, resource limits, and misleading claims. Update README, threat/privacy docs, ADRs, and plans when behavior changes.
