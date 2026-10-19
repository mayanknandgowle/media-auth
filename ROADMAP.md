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

The first Phase 1 increment adds bounded 8-bit baseline/progressive JPEG probing and CLI `probe`, alongside static PNG. Broader formats and complete parser validation remain deferred; see [ADR 0004](docs/adr/0004-jpeg-probe-and-cli.md).

The second Phase 1 increment adds selected static WebP RIFF/VP8/VP8L/VP8X probing to the CLI, with original fixtures, independent decode checks, and adversarial header/budget tests; see [ADR 0005](docs/adr/0005-static-webp-probe.md). Phase 1 remains incomplete: broader containers, sustained fuzzing, and more extensive adversarial corpora are future work. The extension remains PNG-only.

Exact identity and minimal discovery already exist in Phase 0; their later phases refer to broader capabilities. No passive surveillance, face recognition, watermark cracking, or arbitrary URL-fetch service is planned as part of this foundation. See [research boundaries](docs/RESEARCH.md) for evaluation requirements.

The third Phase 1 increment adds bounded single-image GIF87a/GIF89a probing and logical-screen dimensions to the CLI, with original independently decoded fixtures and adversarial block/budget tests; see [ADR 0006](docs/adr/0006-single-image-gif-probe.md). Animation, pixel decoding, and extension GIF acquisition are deferred. This increment does not complete Phase 1 or begin metadata intelligence.

The fourth Phase 1 increment adds a [reproducible cross-format adversarial corpus](docs/PROBE_CORPUS.md) and fixes demonstrated PNG/CLI read-budget gaps. It advances parser-budget evidence across all four formats. The finite mutation suite does not complete the broader format/corpus work or replace sustained fuzzing; metadata intelligence remains a separate phase.

The fifth Phase 1 increment adds bounded uncompressed 24-bit BI_RGB BMP probing and CLI inspection, with top-down/bottom-up fixtures, independent pixel checks, and expanded mutation coverage; see [ADR 0007](docs/adr/0007-24-bit-bmp-probe.md). Other BMP variants, decoding, and metadata interpretation remain deferred. Phase 1 remains incomplete; this does not start Phase 2.
