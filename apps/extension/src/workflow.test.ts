import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { SelectionRegistry } from './selection.js';
import { analyzeAcquiredImage, createWorkflow, type BrowserPort } from './workflow.js';

describe('extension pipeline integration', () => {
  it('requires a discovered selection, acquires only that asset, and produces honest evidence', async () => {
    const fixture = new Uint8Array(
      await readFile(new URL('../../../tests/fixtures/known.png', import.meta.url)),
    );
    const acquire = vi.fn().mockResolvedValue(fixture);
    const port: BrowserPort = {
      activeTab: async () => ({ id: 1, url: 'https://example.test/page' }),
      discover: async () => ({
        documentId: 'doc-1',
        value: {
          pageUrl: 'https://example.test/page',
          images: [{ url: 'https://example.test/known.png', label: 'Known fixture' }],
        },
      }),
      acquire,
    };
    const request = createWorkflow(port, new SelectionRegistry(() => 'session'));
    expect(await request({ kind: 'ANALYZE', selectionKey: 'unregistered' })).toMatchObject({
      kind: 'ERROR',
    });
    expect(acquire).not.toHaveBeenCalled();
    expect(await request({ kind: 'DISCOVER' })).toMatchObject({
      kind: 'DISCOVERED',
      candidates: [{ selectionKey: 'session-0', available: true }],
    });
    expect(acquire).not.toHaveBeenCalled();
    const response = await request({ kind: 'ANALYZE', selectionKey: 'session-0' });
    expect(response.kind).toBe('ANALYZED');
    if (response.kind !== 'ANALYZED') throw new Error(JSON.stringify(response));
    expect(response.result.media.source.acquisition).toBe('ORIGINAL_WEB_ASSET');
    expect(response.result.media.mimeType).toBe('image/png');
    expect(response.result.conclusion.verdict).toBe('INCONCLUSIVE');
    expect(
      response.result.evidence.some(
        (evidence) => evidence.category === 'EXACT_IDENTITY' && evidence.status === 'DETECTED',
      ),
    ).toBe(true);
    expect(
      response.result.evidence.some(
        (evidence) => evidence.category === 'AI_GENERATION' && evidence.status === 'UNAVAILABLE',
      ),
    ).toBe(true);
    expect(
      response.result.evidence.some(
        (evidence) => evidence.category === 'PROVENANCE' && evidence.status === 'UNAVAILABLE',
      ),
    ).toBe(true);
    expect(acquire).toHaveBeenCalledExactlyOnceWith({
      tabId: 1,
      documentId: 'doc-1',
      pageUrl: 'https://example.test/page',
      assetUrl: 'https://example.test/known.png',
    });
  });

  it('serializes work and refuses to analyze when the active page changes during acquisition', async () => {
    let pageUrl = 'https://example.test/page';
    let release: ((bytes: Uint8Array) => void) | undefined;
    const inspect = vi.fn(analyzeAcquiredImage);
    const port: BrowserPort = {
      activeTab: async () => ({ id: 1, url: pageUrl }),
      discover: async () => ({
        documentId: 'doc-1',
        value: { pageUrl, images: [{ url: 'https://example.test/known.png', label: 'Fixture' }] },
      }),
      acquire: async () =>
        new Promise<Uint8Array>((resolve) => {
          release = resolve;
        }),
    };
    const request = createWorkflow(port, new SelectionRegistry(() => 'session'), inspect);
    await request({ kind: 'DISCOVER' });
    const pending = request({ kind: 'ANALYZE', selectionKey: 'session-0' });
    await Promise.resolve();
    expect(await request({ kind: 'DISCOVER' })).toMatchObject({
      kind: 'ERROR',
      message: expect.stringContaining('already running'),
    });
    pageUrl = 'https://example.test/new-page';
    if (!release) throw new Error('Acquisition was not invoked');
    release(new Uint8Array([1]));
    expect(await pending).toMatchObject({
      kind: 'ERROR',
      message: expect.stringContaining('page changed'),
    });
    expect(inspect).not.toHaveBeenCalled();
  });
});
