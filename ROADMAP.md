# Roadmap

This is an aspirational sequence, not a delivery schedule. Later phases require research, validation, and separate design decisions. No item below should be read as an implemented detector or service.

| Phase                                               | Direction                                                   | Exit evidence                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| 0 — Foundation                                      | Evidence contracts, bounded PNG, CLI, extension, tests/docs | Recorded validation and honest limitations                           |
| 1 — Media probing                                   | Broader image/container detection and dimensions            | Adversarial fixture corpus and parser budgets                        |
| 2 — Metadata intelligence                           | Bounded EXIF/XMP/IPTC/ICC observations                      | Format-specific correctness and uncertainty tests                    |
| 3 — Camera / RAW intelligence                       | Recorded capture clues and RAW structure                    | Explainable separation of metadata and inference                     |
| 4 — Provenance / C2PA                               | Genuine adapter verification and trust policy               | Signed, invalid, absent, and unavailable test credentials            |
| 5 — Browser media discovery                         | More document/media contexts                                | Explicit-permission UX and origin-boundary tests                     |
| 6 — Selection / region capture                      | Blobs, regions, capture context                             | Metadata-loss disclosures and acquisition truthfulness               |
| 7 — Evidence fusion                                 | Conflict handling, correlation, trust, calibration          | Transparent policy evaluation against independent evidence           |
| 8 — Initial authenticity / synthetic-media analysis | Research-backed image analyzers                             | Model cards, licenses, held-out and unknown-generator evaluation     |
| 9 — Manipulation localization                       | Spatial evidence and uncertainty                            | Localization metrics and calibrated explanations                     |
| 10 — Fingerprinting                                 | Perceptual/near-duplicate matching                          | Robustness and collision/false-match evaluation                      |
| 11 — Video                                          | Sampling, temporal/container evidence                       | Resource-bounded temporal analysis                                   |
| 12 — Audio                                          | Provenance, signal and synthetic-speech evidence            | Robust temporal/audio evaluation                                     |
| 13 — Multimodal analysis                            | Cross-modal evidence and consistency                        | Evidence correlation and failure analysis                            |
| 14 — Benchmarks                                     | Reproducible datasets and evaluations                       | Versioned manifests, rights, leakage controls, published methodology |
| 15 — SDK / API                                      | Stable external contracts, CLI/SDK/API distribution         | Compatibility, security, and lifecycle guarantees                    |
| 16 — Ecosystem                                      | Third-party providers and integrations                      | Isolation, capability permissions, review, attribution               |

Exact identity and minimal discovery already exist in Phase 0; their later phases refer to broader capabilities. No passive surveillance, face recognition, watermark cracking, or arbitrary URL-fetch service is planned as part of this foundation. See [research boundaries](docs/RESEARCH.md) for evaluation requirements.
