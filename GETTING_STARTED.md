# MediaAuth Image Inspector

Inspect selected images on your device and export an explainable evidence report. This release supports the documented PNG, JPEG, WebP, single-image GIF, and 24-bit BMP subsets. It reports container dimensions and SHA-256 byte identity. Provenance verification, AI-generation, watermark, and manipulation analyzers are visibly unavailable; an inconclusive report is an honest result.

JPEG, static WebP and static PNG reports also show selected recorded EXIF camera/lens make/model, software, date/time strings, orientation and pixel dimensions. Fields may be forged or sensitive. A numeric comparison reports whether complete recorded dimensions match encoded axes, differ, or cannot be compared; missing values never imply agreement. Legitimate JPEG padding or historical metadata can explain differences; matching numbers do not verify authenticity. Dates are not verified or normalized, and orientation does not change either dimension pair. No EXIF found in the declared search scope (JPEG before the first scan, the static WebP RIFF extent, or the CRC-checked static PNG datastream) is scoped absence, not authenticity; malformed metadata is inconclusive. GPS, owner/serial, maker notes, thumbnails, IPTC and ICC are not extracted. Selected JPEG XMP is described below.

## Install the extension

JPEG reports also show selected recorded XMP creator-tool and creation/modification/metadata date strings in a separate card. These may be forged or sensitive; dates are not verified or normalized, and the tool name does not prove editing history. The limited UTF-8 XML/RDF reader rejects extended packets, DTD/entity declarations and unsupported structures within its pre-scan scope. Missing pre-scan XMP is scoped absence, not authenticity. WebP/PNG XMP, title/author/history and metadata reconciliation are not implemented.

Use Chrome or Chromium 116 or newer.

1. Extract `mediaauth-image-inspector.zip` into a folder. If working from source instead, run `npm ci`, then `npm run package:extension`; use `apps/extension/dist` directly.
2. Visit `chrome://extensions` and turn on **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json` (or `apps/extension/dist` from source).
4. Pin **MediaAuth Image Inspector** using the browser's Extensions menu, then click its toolbar button to open the inspector.

The archive is an unpacked developer distribution, not a signed Chrome Web Store installation. Keep the extracted folder in place while the extension is installed. Updating from source requires a rebuild and the extension's **Reload** button.

## Inspect a local file

Choose **Open a local image** in the inspector and select a file up to 8 MiB. No page access is needed. The file stays on your device and is identified by its bytes, even when its filename is misleading. Animated GIF/WebP, SVG, other BMP variants, video, and audio are unsupported.

Read the assessment, file facts, SHA-256, evidence cards, and scope/limitations. **Observed** identifies an available observation; it does not mean authentic. **Unavailable** means that analysis was not performed. File hashes establish exact byte identity, never origin or authorship. A header probe does not guarantee full decodability.

Choose **Download JSON report** to save the current evidence. The report includes acquisition context and may include the selected filename and recorded EXIF fields, but not raw image bytes. Only your click initiates the download. **Clear session** clears the displayed result and forgets page selections; it does not delete reports you already saved.

## Inspect a page image

Open an HTTP(S) page and invoke MediaAuth from the toolbar to grant temporary page access. Choose **Discover page images**, then explicitly choose one listed image to acquire it. Discovery alone does not fetch image bytes.

Only top-document, same-origin assets without URL credentials are eligible. Acquisition omits cookies/referrer and rejects redirects. The origin can observe the selected asset request and can serve different bytes from the previously displayed image. Cross-origin assets, blob/data URLs, screenshots, and authenticated media are not supported. For those sources, you can separately obtain a file yourself and explicitly select it as a local file; its report remains labeled as a local file.

From source, `npm run fixture:serve` serves an original test page at `http://127.0.0.1:4173/` and a ten-format gallery at `http://127.0.0.1:4173/gallery`.

## Troubleshooting

- **Page access unavailable:** invoke the toolbar button again on the intended page. Browser internal pages and store pages can restrict extension access. Local-file inspection still works.
- **Unsupported media:** use one of the documented subsets. Renaming a file cannot change its format.
- **Byte/pixel/chunk limit:** select a supported smaller input. Limits protect the parser; they do not promise support for every 8 MiB image.
- **Selected document changed:** discover again after navigation, reload, or worker restart.
- **Unexpected error:** clear the session, retry with a known fixture, and inspect the extension error view. Do not attach private media to public issues.

## CLI and development

With Node 24.x / npm 11.x, run `npm ci`, `npm run check`, and `npm run test:browser` after installing test Chromium using `npx playwright install chromium`.

```sh
node apps/cli/dist/index.js inspect path/to/image.jpg
node apps/cli/dist/index.js probe path/to/image.webp
node apps/cli/dist/index.js fingerprint path/to/file
```

See README, ARCHITECTURE, PRIVACY, SECURITY, and the ADRs in the source repository for exact boundaries. No accounts, telemetry, saved browsing history, remote inference, automatic uploads, or automatic authenticity verdicts are part of this release.
