# ADR 0003: Explicit acquisition and narrow bounded PNG inspection

Status: Accepted — 2026-10-09

## Context

Arbitrary webpage media can be cross-origin, credentialed, malformed, enormous, or replaced after discovery. Screenshots lose original structures and must never masquerade as original assets. A complete multimedia/parser stack would exceed the foundation milestone.

## Decision

Implement only bounded static PNG structural inspection and native exact SHA-256. Parse selected container framing/header/order/CRC without decompression; record only actual header observations. The CLI accepts local regular files and guards file lifecycle/size. Its fingerprint command can hash other bounded files without claiming they are supported media.

Keep descriptors usable without bytes or a known size. Associate typed provenance records without granting them trust. Handles independently expose range reads and replayable streams; concrete file/memory adapters provide both. The current byte-backed adapters require a known size to enforce their budgets. The PNG probe requires range access, and the hash adapter requires streaming; unavailable access must not become negative evidence. Unknown-length/one-shot stream acquisition is deferred.

Use MV3 with `activeTab`, `scripting`, and `sidePanel`. Require user-driven discovery and a registered selection. Bind candidates to tab, document ID, page URL, and expiration; acquire in the top-frame isolated context. Require same-origin HTTP(S), omit credentials/referrer, disallow redirects, cap streamed bytes/chunks/time, and process one request at a time. Do not add broad host permissions, persistent content scripts, arbitrary background URL fetching, screenshot fallback, or retention.

The same trusted panel document may run in a side panel or extension tab; its exact extension URL and sender ID are the message boundary. Merely requiring absence of `sender.tab` would conflate presentation with trust. Browser harness permissions are separate from the production manifest and must be disclosed in validation results.

## Consequences and deferred work

The controlled local fixture works with minimal permissions. Many real pages will be unsupported, especially cross-origin or authenticated media. Acquisition context remains truthful. WebCrypto needs a bounded whole-file buffer while Node hashing streams. Rich metadata parsing, JPEG, APNG, captures, blobs, other formats, hard parser isolation, and cross-origin permission UX require explicit follow-up design and tests.

References: [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting), [sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), and [W3C PNG specification](https://www.w3.org/TR/png/).
