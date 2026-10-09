# Security policy

MediaAuth is an early foundation, not a validated forensic decision system. Treat media, metadata, page content, URLs, and analyzer output as untrusted. See the [threat model](docs/THREAT_MODEL.md) for controls and residual risks.

Only the current development branch receives fixes during this pre-release stage; there are no supported stable releases. Do not upload confidential evidence, executable exploits, or sensitive media to public issues.

For a vulnerability, use the repository host's private vulnerability reporting feature if enabled. Otherwise ask a maintainer for a private reporting channel without posting exploit details. No dedicated security mailbox or response-time commitment has been established. Include affected revision, platform, reproduction steps with a minimized non-sensitive fixture, impact, and suggested mitigation.

Changes involving parsers, host permissions, external URLs, cryptographic/provenance claims, remote inference, or plugin execution require security regression tests and a threat-model update. Dependencies and browser runtimes must be kept current through reviewed lockfile changes. Never interpret a successful CRC or hash as proof of authenticity.
