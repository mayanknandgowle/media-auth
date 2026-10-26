# MediaAuth Image Inspector

Build from the repository root with `npm run build:extension`, or run `npm run package:extension` for the unpacked ZIP distribution in `dist/`. See [getting started](../../GETTING_STARTED.md) for user installation and local-file inspection. Load `apps/extension/dist` as an unpacked extension in Chromium 116 or newer. The extension requests only `activeTab`, `scripting`, and `sidePanel`; it has no host permissions or persistent content scripts.

## Local inspection and reports

Choose a supported local file in the panel to inspect it without activeTab or any network request. PNG, 8-bit baseline/progressive JPEG, selected static WebP, single-image GIF, and 24-bit BI_RGB BMP subsets match the CLI. The file adapter validates size before reading, bounds its stream and deadline, and rejects size mismatches. Results are labeled `LOCAL_FILE`; page assets remain `ORIGINAL_WEB_ASSET`.

Read the file facts, SHA-256, eleven evidence cards, including separate EXIF and JPEG XMP fields, reasons and limitations. **Download JSON report** explicitly saves evidence and may include a filename, never raw media bytes. Starting/failing a new operation invalidates the previous export. **Clear session** removes panel results and forgets worker selections; exported files remain user-controlled.

## Manual smoke test

JPEG XMP has a separate eleventh evidence card for selected recorded creator-tool/date claims. Unicode/reference-decoded values remain literal text and JSON, without proving editing history or reconciling EXIF. Missing pre-scan packets, unsupported structures and unavailable reads stay distinct. See [ADR 0014](../../docs/adr/0014-bounded-jpeg-xmp.md).

EXIF cards also show recorded pixel width/height and a numeric comparison on encoded axes without orientation. Both pairs appear when complete; missing values explicitly prevent comparison. Agreement does not verify authenticity, and differences can reflect padding or historical metadata without proving editing. See [ADR 0013](../../docs/adr/0013-exif-dimension-comparison.md).

1. Run `npm run fixture:serve` and open `http://127.0.0.1:4173/` in the browser that loaded the unpacked extension.
2. Invoke the MediaAuth toolbar action. Its user gesture opens the Side Panel and grants temporary page access.
3. Click **Discover page images**. The known blue PNG should appear. The `/gallery` fixture route also supplies all ten original supported fixtures. Discovery reads image element URLs and labels; it does not acquire media bytes.
4. Click **Analyze Known blue PNG fixture**. Expect `ORIGINAL_WEB_ASSET`, `image/png`, dimensions 1 × 1, recorded PNG metadata, SHA-256 `d5947f90e10810acc699524e3da32f6fb811e27788922e7409a9dd9f9e7ab984`, and `INCONCLUSIVE`. Provenance, watermark, AI generation, and manipulation analyzers must report `UNAVAILABLE`.
5. Navigate the page and try its old selection. Expect a stale-selection error. Invoke the toolbar action and discover again to inspect the current document.
6. Check the extension's error view for worker or panel errors. Close the panel; no analysis should continue periodically or on future browsing.

## Automated coverage and its limit

`npm run test:browser` requires the Playwright Chromium browser (`npx playwright install chromium`). It first loads the exact production extension and checks its manifest, Side Panel configuration, and refusal to inspect a page without an `activeTab` grant. It then tests unchanged production panel/worker code with a **temporary test-only loopback host permission** and the panel rendered as an extension tab. This exercises real Chromium messaging, isolated-world discovery/fetch, byte acquisition, probing, analyzers, and result rendering. The exact production extension additionally tests local-file input for all ten probe fixtures and fourteen metadata fixtures without activeTab, safe injection-like filename rendering, invalid/oversized files, report download/clear, and layouts at 320/640 pixels. The loopback copy tests all ten probe images and fourteen metadata images, checks recorded field text/export and unrotated dimensions, and verifies discovery never fetches their bytes and each selection acquires exactly one asset. Screenshots go to ignored `test-results`.

The extra test permission is never included in the production build. Native toolbar invocation, Chromium's `activeTab` grant, and native Side Panel hosting still require the manual procedure above. Automated integration coverage does not imply these native UI steps passed.

## Boundaries

Only explicit panel actions trigger work. The worker accepts exact request shapes from its own `panel.html` extension page. Page-analysis requests contain opaque, expiring selection keys, never arbitrary URLs. The exact `CLEAR` request forgets these keys without page access. Local files are not transported through messages. Discovery is limited to the top document and 50 unique candidates from the first 1,000 image elements. Unsupported URLs appear as unavailable when their bounded URL can be listed. Selection records exist only in worker memory and expire after five minutes or a worker restart.

Acquisition is bound to the selected tab, document ID, page URL, and a still-present image source. It executes in an isolated script world and permits only same-origin HTTP(S) URLs without embedded credentials. Requests omit credentials and referrers, reject redirects, and enforce a 10-second deadline, 8 MiB streamed-byte limit, and 4,096 stream-chunk limit. All probes enforce a 40-million-pixel limit without decoding pixels, plus their documented byte/block limits. Responses are reacquired asset bytes, which a server may have changed since the page displayed its image; they are not a capture of rendered pixels or proof of an upstream original.

The documented five-format subsets are supported for local and page inspection. Cross-origin page assets, iframes, blob/data URLs, authenticated assets, screenshots, regions, videos, and audio remain deferred or unavailable. There is no raw-media storage, network inference, telemetry, automatic report retention, or preview-image loading. Results are rendered as text, including untrusted filenames and metadata.

Chrome integration follows the official [scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) boundaries.
