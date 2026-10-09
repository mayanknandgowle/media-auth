import { describe, expect, it } from 'vitest';
import { isPanelSender, parsePanelRequest } from './protocol.js';
import { SelectionRegistry } from './selection.js';

describe('extension message boundary', () => {
  it('accepts only exact, bounded messages with opaque selection keys', () => {
    expect(parsePanelRequest({ kind: 'DISCOVER' })).toEqual({ kind: 'DISCOVER' });
    expect(parsePanelRequest({ kind: 'ANALYZE', selectionKey: 'session-0' })).toEqual({
      kind: 'ANALYZE',
      selectionKey: 'session-0',
    });
    for (const request of [
      null,
      [],
      'DISCOVER',
      { kind: 'DISCOVER', url: 'https://example.com' },
      { kind: 'ANALYZE', url: 'https://example.com' },
      { kind: 'ANALYZE', selectionKey: 'x'.repeat(101) },
      { kind: 'ANALYZE', selectionKey: 'file:///secret' },
    ]) {
      expect(parsePanelRequest(request)).toBeUndefined();
    }
  });

  it('authenticates the extension panel and rejects web pages and other extensions', () => {
    const panelUrl = 'chrome-extension://test/panel.html';
    expect(isPanelSender({ id: 'test', url: panelUrl }, 'test', panelUrl)).toBe(true);
    for (const sender of [
      { id: 'test', url: 'https://example.com' },
      { id: 'other', url: panelUrl },
      { id: 'test', url: `${panelUrl}?untrusted` },
      {},
    ]) {
      expect(isPanelSender(sender, 'test', panelUrl)).toBe(false);
    }
  });
});

describe('user selection registry', () => {
  const discovered = {
    pageUrl: 'https://example.test/page',
    images: [{ url: 'https://example.test/image.png', label: 'Fixture' }],
  };

  it('only authorizes discovered same-origin HTTP(S) image assets', () => {
    const registry = new SelectionRegistry(() => 'session');
    const candidates = registry.register(1, 'doc-1', {
      ...discovered,
      images: [
        ...discovered.images,
        { url: 'https://other.test/image.png', label: 'Cross-origin' },
        { url: 'data:image/png;base64,AA==', label: 'Inline' },
        { url: 'file:///secret', label: 'Local' },
        { url: 'https://user:password@example.test/image.png', label: 'Credentials' },
      ],
    });
    expect(candidates.map((image) => image.available)).toEqual([true, false, false, false, false]);
    expect(registry.select('session-0', 1, discovered.pageUrl)).toMatchObject({
      assetUrl: discovered.images[0]?.url,
      documentId: 'doc-1',
    });
    expect(() => registry.select('session-1', 1, discovered.pageUrl)).toThrow(
      'Selection unavailable',
    );
    expect(() => registry.select('https://other.test', 1, discovered.pageUrl)).toThrow();
  });

  it('invalidates stale selections on tab changes, URL changes, expiry, and rediscovery', () => {
    let now = 0;
    let session = 0;
    const registry = new SelectionRegistry(
      () => `session${session++}`,
      () => now,
    );
    registry.register(1, 'doc-1', discovered);
    expect(() => registry.select('session0-0', 2, discovered.pageUrl)).toThrow();
    expect(() => registry.select('session0-0', 1, 'https://example.test/changed')).toThrow();
    now = 300_000;
    expect(() => registry.select('session0-0', 1, discovered.pageUrl)).toThrow('expired');
    registry.register(1, 'doc-2', discovered);
    registry.register(1, 'doc-3', discovered);
    expect(() => registry.select('session1-0', 1, discovered.pageUrl)).toThrow();
    expect(registry.select('session2-0', 1, discovered.pageUrl).documentId).toBe('doc-3');
  });

  it('rejects malformed or excessive discovery payloads', () => {
    const registry = new SelectionRegistry(() => 'session');
    for (const value of [
      null,
      { ...discovered, images: Array.from({ length: 51 }, () => discovered.images[0]) },
      { ...discovered, images: [{ label: 'x', url: 5 }] },
      { ...discovered, pageUrl: 'file:///private' },
    ]) {
      expect(() => registry.register(1, 'doc', value)).toThrow();
    }
  });
});
