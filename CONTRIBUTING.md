# Contributing

Read the [README](README.md), [architecture](ARCHITECTURE.md), [agent rules](AGENTS.md), and [code of conduct](CODE_OF_CONDUCT.md). Discuss substantial product or architecture changes in an issue before implementation when practical. Security vulnerabilities follow [SECURITY.md](SECURITY.md), not public issues.

Use Node 24.x / npm 11.x, run `npm ci`, and then `npm run check`. For extension changes, run `npm run test:browser` after installing Chromium with `npx playwright install chromium`, and perform the manual toolbar/side-panel flow documented in the README when automation cannot cover it. Include observed commands/results and mark checks you could not perform `NOT VERIFIED`.

Keep changes small and reviewable. Add deterministic behavior/security regression tests; avoid network-dependent fixtures and real sensitive media. Use strict types and runtime checks at untrusted boundaries. Use `npm run format` before submitting. New dependencies need a clear current responsibility, license review, and lockfile update. Do not bundle detector models or datasets without separate license/consent/provenance review.

For complex changes, create a living plan under `docs/plans/` using [.agent/PLANS.md](.agent/PLANS.md); significant architectural decisions get an ADR. Update documentation whenever behavior, permissions, supported formats, limits, or evidence semantics change.

Use descriptive branches and conventional commit messages such as `feat(media): add bounded JPEG dimensions probe`. Avoid unrelated refactors in feature changes. A pull request should explain the problem, resulting behavior, meaningful tradeoffs, and actual validation. Do not claim AI detection or verification that has not been implemented and independently evaluated.

By intentionally submitting original contributions, you offer them under Apache-2.0, subject to any separately agreed terms. Retain third-party notices and identify copied/adapted material. Project licensing does not override dependency, model, dataset, or external-service terms.
