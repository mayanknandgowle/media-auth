# ADR 0009: explicit local-file inspection and evidence reports

Status: accepted for this increment, 2026-10-22.

## Decision

Make existing bounded PNG/JPEG/WebP/GIF/BMP probes available to both clients. The extension composes `imageProbe` and the existing analyzer registry with native WebCrypto. Core, probes and evidence contracts remain independent of UI and host APIs.

A browser-only adapter streams an explicitly selected File into bounded memory in the panel. Check declared size before creating a reader/allocation; enforce exact stream size, chunk count/size, and a 10-second acquisition deadline. Cancel/release the reader on completion/error. Local bytes are passed directly to the analysis composition, never through runtime messages; no filesystem/host permission is added. Acquisition is labeled `LOCAL_FILE` and may include a bounded filename. Page images retain origin/document-bound opaque selections and are labeled `ORIGINAL_WEB_ASSET`.

Keep orchestration, file acquisition, bounded report view construction, and DOM presentation in separate modules. Presentation validates the JSON budget, media facts, evidence contracts/unique IDs, hash encoding, and conclusion references before showing/exporting a result. Treat names, explanations, and details as text; never use innerHTML, media previews, remote fonts, or third-party UI code. Preserve the baseline's explicit uncertainty and unavailable analyzers.

## State, privacy, and export

One panel operation runs at a time. Starting or failing an operation clears the prior export, preventing stale-report downloads. Clear removes the report/file selection and sends an exact authenticated `CLEAR` request to forget worker selections without page access. Downloads require a user click and contain report JSON only; the object URL is revoked. Export is deliberate persistence and may reveal a filename. No automatic history or media retention is introduced; clearing does not delete user-saved reports.

No permission/CSP expansion. Local input works without activeTab. Page acquisition still needs an actual toolbar invocation, which automation cannot establish. Report downloads use a user-activated anchor and need no downloads API permission. Native Side Panel hosting stays a separately reported verification step.

## Distribution and limits

Use existing Node tooling to build a small unpacked extension archive with a fixed file allowlist, license, attribution and setup guide. Archive entries have fixed timestamps and order for byte reproducibility on the same build. The packaging script writes stored ZIP records only; it does not accept arbitrary archive entries or extract user-supplied archives. The archive is not signed or store-published. Packaging format follows the [PKWARE ZIP specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

The 8 MiB cap is not peak memory; WebCrypto and memory snapshots use copies. Production analyzers are trusted in-process code with cooperative cancellation; the file acquisition deadline is not a hard parser deadline. Format subsets, metadata limitations and unavailable forensic/provenance capabilities are unchanged. This completes an image-inspection release workflow while the broader roadmap remains aspirational.
