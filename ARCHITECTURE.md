# Architecture

## Dependency direction

```text
CLI (filesystem) ─────────┐
                         ├── media (bounded probe) ── core
Extension (Chrome/DOM) ───┤
                         └── analyzers (adapters) ─── core
```

Core imports no host APIs, frameworks, or other packages. A separate TypeScript configuration excludes Node/DOM globals; the boundary check rejects undeclared cross-package dependencies. Media and analyzers use the domain interfaces. Client adapters own filesystem/browser permissions and resource lifetimes. Node/Web cryptography is isolated behind explicit `analyzers/node` and `analyzers/web` entry points. There are no UI frameworks, backend services, global registries, or automatic plugin loading.

## Input and execution

`Media` can carry a descriptor without byte access. `MediaDescriptor` is serializable and carries kind, MIME, acquisition method, optional size/dimensions/duration/hash, associated provenance records, metadata availability, access capabilities, and limitations. Associated provenance is an observation supplied by a provider; it does not confer trust or change the baseline conclusion.

An optional `MediaHandle` offers range reads, replayable streaming, or both without requiring the domain to hold all bytes. The current bounded adapters require a known handle size; unknown-length or one-shot streams need a future acquisition adapter. `CompleteMediaHandle` names the stronger guarantee provided by local-file and memory adapters. Clients close handles. Memory handles snapshot their input; the CLI checks file identity and changes around reads. Byte-dependent analyzers report `UNAVAILABLE` without usable access. The PNG, JPEG, WebP, GIF, and BMP probes require range reads, while exact hashing requires streaming. Remote/object-backed handles can implement the same contract later.

`MediaProbe` discovers properties. CLI `imageProbe` dispatches static PNG/WebP, single-image GIF, 24-bit BI_RGB BMP, and 8-bit baseline/progressive JPEG by byte signature; the extension also uses `imageProbe`. PNG checks selected framing/order/CRC. JPEG uses forward buffered reads to check selected marker/frame/scan structure and encoded dimensions. WebP reads fixed-size RIFF/chunk/image headers and skips bounded payloads; it checks selected static reconstruction order and canvas/image dimension agreement. GIF walks bounded block/sub-block framing, skips payloads, and reports logical-screen dimensions while checking the sole image fits. BMP checks fixed headers, signed dimensions, and padded-row extents while skipping pixels and optional gaps. All enforce resource budgets and reject unsupported input without guessing from a filename. None decodes compressed pixels or promises complete format conformance. JPEG coding tables and full progressive scan progression, WebP compressed color/alpha streams, GIF LZW pixels and application semantics, and metadata payloads remain unvalidated; orientation is not applied. CLI `probe` returns only the descriptor; `inspect` composes the analyzer pipeline. Metadata availability remains `NOT_PROBED` for unparsed metadata; lack of inspection is never absence.

Each explicitly registered `Analyzer` declares identity/version, category, supported media, and capabilities. Execution is sequential and stable in registration order, with injected limits and cooperative cancellation. Exceptions or invalid output become explicit `UNAVAILABLE` evidence; cancellation and exhausted budgets terminate analysis. Remote analyzers require an explicit option that clients must protect with informed consent. No remote analyzers ship.

The current metadata path reports PNG/JPEG/WebP/GIF/BMP header observations; the hash path reports exact SHA-256 byte identity. The container-dimensions analyzer is version 0.5.0 after adding BMP. Adapter contracts separately describe metadata providers, provenance verification, exact hashing, and perceptual fingerprints. Deferred analyzers expose their absence transparently. A future provider-neutral watermark analyzer uses the same contract; there is no vendor-specific dependency.

All probe range requests and CLI file reads obey `min(64 KiB, maxChunkBytes)`. PNG splits fixed headers and CRC traversal at that boundary while retaining chunk-payload limits. The [test corpus](docs/PROBE_CORPUS.md) verifies these shared range invariants with guarded adapters; its Node-only byte builders stay outside production packages.

## Evidence and conclusions

`Evidence` is a versioned discriminated union: `DETECTED`, `NOT_DETECTED` with search scope, `UNAVAILABLE` with a reason, or `INCONCLUSIVE` with a reason. Missing evidence, unavailable evidence, and negative observations cannot share a boolean. Evidence records source identity, category, explanation, reliability/completeness, machine-readable details, optional hash, normalized spatial bounds, and temporal bounds. Runtime validation constrains JSON depth, count, size, status, confidence, and attribution before accepting plugin output.

Detector confidence is distinct from evidence quality/reliability, signer trust, and conclusion confidence. An uncalibrated detector score cannot implicitly become trusted evidence. `Provenance`, `Claim`, `Assertion`, `Credential`, `Signer`, `Transformation`, and `VerificationResult` are provider-neutral. `ABSENT` means an adapter actually established absence; the unavailable placeholder never claims it. Capture metadata is a recorded observation.

`EvidenceFusion` is injected independently of analyzers. Baseline fusion neither votes nor scores. It preserves all evidence references and emits unknown origin/modification, unavailable provenance assessment, and no assessed conclusion confidence. It does not elevate a future provenance adapter's output until an explicit trust-aware fusion policy exists. Verdict taxonomy and separate origin/modification/provenance axes support future policies without flattening uncertainty.

## Extension trust boundaries

Toolbar invocation grants temporary active-tab access. The panel sends strictly parsed discover/select requests to its service worker. Only the extension's own panel URL and sender identity are accepted. Discovery runs in an isolated world in the top frame. An ephemeral registry binds opaque selections to tab ID, document ID, URL, and expiration; the page cannot supply arbitrary URLs to the worker.

Selected assets are fetched in the page's isolated execution context, constrained to the same origin, HTTP(S), no URL credentials, no cookies/referrer, and no redirects. Streaming response bytes, chunk count, acquisition time, and later parser work are bounded. Document-bound injection prevents a selection being reused on a replacement document. Output is rendered as text; raw media and browsing state are not persisted. Only one operation runs at a time per panel/workflow.

## Extension points and non-goals

Image/video/audio types, optional duration/location, transformation references, and provider identifiers leave room for evidence graphs. They do not implement multimedia parsing or a graph engine. A future SDK needs public exports, declarations, schema compatibility policy, and release tests. Third-party code needs execution isolation; types and output validation are not a sandbox. Cloud services, accounts, databases, detector models, C2PA SDK integration, and research execution infrastructure are absent by design.

See [ADRs](docs/adr/0001-workspaces-and-boundaries.md), [threat model](docs/THREAT_MODEL.md), and [research direction](docs/RESEARCH.md).

## Image-inspection client

The extension panel can acquire an explicitly selected local File through a browser adapter. Size is checked before reading/allocation; exact stream size, byte/chunk limits and a 10-second acquisition deadline are enforced. Local bytes stay in the panel, which composes the same five probes and WebCrypto registry as page inspection. No filesystem paths or file bytes enter the runtime message protocol. The source is `LOCAL_FILE`, with a bounded optional filename.

`report.ts` builds a bounded, validated presentation model; panel orchestration renders text-only facts, evidence and limitations, keeping domain decisions in the existing fusion layer. Each new operation invalidates the previous export. A deliberate JSON download contains evidence only; clear removes panel state and sends an authenticated `CLEAR` request to forget worker selections, without requiring page access. See [ADR 0009](docs/adr/0009-local-image-inspection-client.md).
