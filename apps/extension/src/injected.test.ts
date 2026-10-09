import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquirePageImage, discoverPageImages } from './injected.js';

const pageUrl = 'https://example.test/page';
const assetUrl = 'https://example.test/image.png';
function page(images = [{ currentSrc: assetUrl, src: assetUrl, alt: 'Fixture' }]): void {
  vi.stubGlobal('location', { href: pageUrl, origin: 'https://example.test' });
  vi.stubGlobal('document', {
    images: { length: images.length, item: (index: number) => images[index] },
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('explicit page inspection', () => {
  it('discovers unique image candidates with a hard result bound and no fetch', () => {
    page([
      { currentSrc: assetUrl, src: assetUrl, alt: '<script>alert(1)</script>' },
      { currentSrc: assetUrl, src: assetUrl, alt: 'Duplicate' },
      { currentSrc: 'https://example.test/second.png', src: '', alt: 'Second' },
    ]);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(discoverPageImages(1)).toEqual({
      pageUrl,
      images: [{ url: assetUrl, label: '<script>alert(1)</script>' }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('selected original asset acquisition', () => {
  it('fetches a selected same-origin image with no credentials, redirects, or referrer', async () => {
    page();
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetch);
    expect(await acquirePageImage(assetUrl, pageUrl, 10, 1000, 10)).toEqual({
      ok: true,
      base64: 'AQID',
    });
    expect(fetch).toHaveBeenCalledWith(
      assetUrl,
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        mode: 'same-origin',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    );
  });

  it('rejects stale pages, missing candidates, URL credentials, and cross-origin URLs before fetching', async () => {
    page();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (const [url, expectedPage] of [
      [assetUrl, 'https://example.test/old'],
      ['https://other.test/image.png', pageUrl],
      ['https://example.test/not-selected.png', pageUrl],
      ['https://user:password@example.test/image.png', pageUrl],
      ['file:///secret', pageUrl],
    ]) {
      expect(await acquirePageImage(url ?? '', expectedPage ?? '', 10, 1000, 10)).toMatchObject({
        ok: false,
      });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('bounds streamed bytes even without a Content-Length header', async () => {
    page();
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(11));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    expect(await acquirePageImage(assetUrl, pageUrl, 10, 1000, 10)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('limit'),
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('rejects declared oversized responses before streaming', async () => {
    page();
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(new ReadableStream({ cancel }), { headers: { 'content-length': '999' } }),
        ),
    );
    expect(await acquirePageImage(assetUrl, pageUrl, 10, 1000, 10)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('byte limit'),
    });
    expect(cancel).toHaveBeenCalled();
  });

  it('bounds tiny-chunk overhead and rejects empty files', async () => {
    page();
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(new Uint8Array([0]));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    expect(await acquirePageImage(assetUrl, pageUrl, 100, 1000, 3)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('chunk limit'),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array())));
    expect(await acquirePageImage(assetUrl, pageUrl, 100, 1000, 3)).toMatchObject({
      ok: false,
      reason: expect.stringContaining('empty'),
    });
  });

  it('aborts a stalled request at the deadline', async () => {
    page();
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
          }),
      ),
    );
    const acquisition = acquirePageImage(assetUrl, pageUrl, 10, 100, 10);
    await vi.advanceTimersByTimeAsync(101);
    expect(await acquisition).toMatchObject({
      ok: false,
      reason: expect.stringContaining('timed out'),
    });
  });
});
