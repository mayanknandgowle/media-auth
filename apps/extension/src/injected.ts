/** These functions are serialized by Chrome. Keep them self-contained, with no captured imports. */
export function discoverPageImages(maxCandidates: number): {
  pageUrl: string;
  images: { url: string; label: string }[];
} {
  const images: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  const candidates = document.images;
  for (let i = 0; i < Math.min(candidates.length, 1000) && images.length < maxCandidates; i++) {
    const image = candidates.item(i);
    const url = image?.currentSrc || image?.src;
    if (!image || !url || url.length > 4096 || seen.has(url)) continue;
    seen.add(url);
    images.push({ url, label: (image.alt || `Image ${images.length + 1}`).slice(0, 160) });
  }
  return { pageUrl: location.href, images };
}

export type AcquiredImage =
  { readonly ok: true; readonly base64: string } | { readonly ok: false; readonly reason: string };

/** Executes in the page's ISOLATED world, retaining the page origin's fetch restrictions. */
export async function acquirePageImage(
  assetUrl: string,
  expectedPageUrl: string,
  maxBytes: number,
  timeoutMs: number,
  maxChunks: number,
): Promise<AcquiredImage> {
  if (location.href !== expectedPageUrl)
    return { ok: false, reason: 'The page changed. Discover images again.' };
  let url: URL;
  try {
    url = new URL(assetUrl);
  } catch {
    return { ok: false, reason: 'Invalid selected asset URL.' };
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== location.origin ||
    url.username ||
    url.password
  ) {
    return {
      ok: false,
      reason: 'Only same-origin HTTP(S) assets without URL credentials are supported.',
    };
  }
  let present = false;
  for (let i = 0; i < Math.min(document.images.length, 1000); i++) {
    const image = document.images.item(i);
    if ((image?.currentSrc || image?.src) === assetUrl) {
      present = true;
      break;
    }
  }
  if (!present)
    return { ok: false, reason: 'The selected image is no longer present. Discover images again.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(assetUrl, {
      method: 'GET',
      cache: 'no-store',
      mode: 'same-origin',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok || !response.body)
      return { ok: false, reason: 'The original asset could not be acquired.' };
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && Number(contentLength) > maxBytes) {
      await response.body.cancel();
      return { ok: false, reason: 'The selected asset exceeds the byte limit.' };
    }
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    let chunks = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        chunks++;
        size += part.value.byteLength;
        if (size > maxBytes || chunks > maxChunks) {
          await reader.cancel();
          return {
            ok: false,
            reason: 'The selected asset exceeds the byte or stream chunk limit.',
          };
        }
        if (part.value.byteLength > 0) parts.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (location.href !== expectedPageUrl)
      return { ok: false, reason: 'The page changed during acquisition. Discover images again.' };
    if (size === 0) return { ok: false, reason: 'The selected asset is empty.' };
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    // Base64 crosses Chrome's JSON serialization boundary without expanding into a number array.
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return { ok: true, base64: btoa(binary) };
  } catch {
    return {
      ok: false,
      reason: 'Acquisition unavailable: fetch failed, redirected, or timed out.',
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
