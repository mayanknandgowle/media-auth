# Privacy

MediaAuth performs analysis only after explicit user selection. The CLI reads the named local file. The extension inspects the active page only after the user invokes its workflow and requests discovery, then fetches only the selected same-origin image. Discovery temporarily records a bounded candidate list; it does not analyze every image.

No analytics, telemetry, browsing history collection, accounts, raw-media database, persistent result storage, or remote inference is implemented. Candidate selections and analysis results exist in memory. The side panel holds the displayed result until replaced or closed; the service worker may retain a bounded selection list until replaced, expired on use, or suspended. There is no guarantee of cryptographic memory erasure.

Acquisition is a network GET to the selected asset's origin. It may be visible to that origin and the browser's networking/service-worker infrastructure. The request omits credentials and referrer, disallows redirects, and uses no-store caching. MediaAuth does not control the origin's logs, the browser's internal caches, or the page's own behavior. An origin may serve different bytes on a later request.

Reports preserve acquisition context: local file, original web asset, blob, screen capture, or other. The initial extension does not capture screenshots. Future capture workflows must explain which original metadata/provenance/signals were lost. Never describe screen-derived pixels as an original asset.

CLI JSON may contain a local file label; results and future metadata can reveal sensitive information. Users control whether to save or share stdout. Avoid placing real private media in test fixtures, logs, bug reports, or commits.

Any future cloud inference must be explicitly opt-in, disclose destination and data before upload, provide meaningful cancellation and retention controls, and update this policy. Core's remote capability gate is a foundation for that consent boundary, not a shipped cloud service.
