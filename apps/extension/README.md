# Extension foundation

Build from the repository root with `npm run build:extension`. Load `apps/extension/dist` as an unpacked extension in Chromium 116 or newer. The extension requests only `activeTab`, `scripting`, and `sidePanel`; it has no host permissions or persistent content scripts.

## Manual smoke test

1. Run `npm run fixture:serve` and open `http://127.0.0.1:4173/` in the browser that loaded the unpacked extension.
2. Invoke the MediaAuth toolbar action. Its user gesture opens the Side Panel and grants temporary page access.
3. Click **Discover page images**. The known blue PNG should appear. Discovery reads image element URLs and labels; it does not acquire media bytes.
4. Click **Analyze Known blue PNG fixture**. Expect `ORIGINAL_WEB_ASSET`, `image/png`, dimensions 1 × 1, recorded PNG metadata, SHA-256 `d5947f90e10810acc699524e3da32f6fb811e27788922e7409a9dd9f9e7ab984`, and `INCONCLUSIVE`. Provenance, watermark, AI generation, and manipulation analyzers must report `UNAVAILABLE`.
5. Navigate the page and try its old selection. Expect a stale-selection error. Invoke the toolbar action and discover again to inspect the current document.
6. Check the extension's error view for worker or panel errors. Close the panel; no analysis should continue periodically or on future browsing.

## Automated coverage and its limit

`npm run test:browser` requires the Playwright Chromium browser (`npx playwright install chromium`). It first loads the exact production extension and checks its manifest, Side Panel configuration, and refusal to inspect a page without an `activeTab` grant. It then tests unchanged production panel/worker code with a **temporary test-only loopback host permission** and the panel rendered as an extension tab. This exercises real Chromium messaging, isolated-world discovery/fetch, byte acquisition, probing, analyzers, and result rendering. The test writes a panel screenshot to the ignored `test-results` directory.

The extra test permission is never included in the production build. Native toolbar invocation, Chromium's `activeTab` grant, and native Side Panel hosting still require the manual procedure above. Automated integration coverage does not imply these native UI steps passed.

## Boundaries

Only explicit panel actions trigger work. The worker accepts exact request shapes from its own `panel.html` extension page. Requests contain opaque, expiring selection keys, never arbitrary URLs. Discovery is limited to the top document and 50 unique candidates from the first 1,000 image elements. Unsupported URLs appear as unavailable when their bounded URL can be listed. Selection records exist only in worker memory and expire after five minutes or a worker restart.

Acquisition is bound to the selected tab, document ID, page URL, and a still-present image source. It executes in an isolated script world and permits only same-origin HTTP(S) URLs without embedded credentials. Requests omit credentials and referrers, reject redirects, and enforce a 10-second deadline, 8 MiB streamed-byte limit, and 4,096 stream-chunk limit. PNG probing enforces a 40-million-pixel limit without decoding pixels. Responses are reacquired asset bytes, which a server may have changed since the page displayed its image; they are not a capture of rendered pixels or proof of an upstream original.

Only validated PNG structure is supported initially. Other formats, cross-origin assets, iframes, blob/data URLs, authenticated assets, screenshots, regions, videos, and audio remain deferred or unavailable. There is no raw-media storage, network inference, telemetry, or preview-image loading. Results are rendered as text, including untrusted metadata.

Chrome integration follows the official [scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) boundaries.
