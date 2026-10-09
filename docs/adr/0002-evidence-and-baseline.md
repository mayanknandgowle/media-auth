# ADR 0002: Versioned evidence and conservative fusion

Status: Accepted — 2026-10-09

## Context

Unavailable analysis, negative observations, and metadata absence have different meanings. A detector's score, evidence reliability, signer trust, and conclusion certainty cannot be collapsed into one number. No authenticity classifier or calibrated fusion policy exists in this milestone.

## Decision

Use serializable discriminated evidence statuses with source identity/version, category, explanations, bounded JSON details, quality/reliability, and optional spatial/temporal/hash references. `NOT_DETECTED` requires a search scope; `UNAVAILABLE` requires a reason and cannot carry detector confidence. Separate origin, modification, provenance, and final verdict taxonomies.

Analyzers produce validated observations; an injected fusion policy alone produces conclusions. The baseline returns `UNKNOWN` when every analyzer is unavailable and `INCONCLUSIVE` when any observation exists. It assigns no authenticity confidence and keeps origin/modification unknown and provenance assessment unavailable. It does not vote, infer camera origin from metadata, or equate hashes/CRC with authenticity.

Schema version `1.0` identifies this initial result shape. Additive changes must preserve existing semantics; breaking changes require a new schema version and explicit adapter/migration tests before external compatibility is promised. The current runtime validator targets analyzer output, not a general persisted-report import format.

## Consequences

Results remain explainable without fabricated capability. Metadata and exact hashing produce useful observations but cannot deliver the future product's authenticity conclusion. A real provenance adapter also needs a trust-aware fusion policy before a verified status can appear in the conclusion. Future graphs and calibrated methods can reference evidence IDs without making analyzers mutate shared verdict state.
