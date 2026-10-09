import { analyze, DEFAULT_LIMITS, type AnalysisResult } from '@media-auth/core';
import { createMemoryHandle, pngProbe } from '@media-auth/media';
import { createFoundationRegistry } from '@media-auth/analyzers';
import { webSha256Hasher } from '@media-auth/analyzers/web';
import type { PanelRequest, PanelResponse } from './protocol.js';
import type { SelectionRegistry, Selection } from './selection.js';

export async function analyzeAcquiredImage(bytes: Uint8Array): Promise<AnalysisResult> {
  const handle = createMemoryHandle(bytes, DEFAULT_LIMITS);
  const descriptor = await pngProbe.probe(
    handle,
    { acquisition: 'ORIGINAL_WEB_ASSET' },
    DEFAULT_LIMITS,
  );
  return analyze({ descriptor, handle }, createFoundationRegistry(webSha256Hasher), {
    limits: DEFAULT_LIMITS,
  });
}

export interface BrowserPort {
  activeTab(): Promise<{ id: number; url: string }>;
  discover(tabId: number): Promise<{ documentId: string; value: unknown }>;
  acquire(selection: Selection): Promise<Uint8Array>;
}

/** Serial execution bounds memory; only opaque registered selections can reach acquisition. */
export function createWorkflow(
  port: BrowserPort,
  registry: SelectionRegistry,
  inspect = analyzeAcquiredImage,
): (request: PanelRequest) => Promise<PanelResponse> {
  let busy = false;
  return async (request) => {
    if (busy) return { kind: 'ERROR', message: 'An operation is already running.' };
    busy = true;
    try {
      const tab = await port.activeTab();
      if (request.kind === 'DISCOVER') {
        registry.clear();
        const discovered = await port.discover(tab.id);
        return {
          kind: 'DISCOVERED',
          candidates: registry.register(tab.id, discovered.documentId, discovered.value),
        };
      }
      const selection = registry.select(request.selectionKey, tab.id, tab.url);
      const bytes = await port.acquire(selection);
      const currentTab = await port.activeTab();
      registry.select(request.selectionKey, currentTab.id, currentTab.url);
      return { kind: 'ANALYZED', result: await inspect(bytes) };
    } catch (error) {
      return {
        kind: 'ERROR',
        message: error instanceof Error ? error.message.slice(0, 500) : 'Operation unavailable.',
      };
    } finally {
      busy = false;
    }
  };
}
