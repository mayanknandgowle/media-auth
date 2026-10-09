import { DEFAULT_LIMITS } from '@media-auth/core';
import { acquirePageImage, discoverPageImages } from './injected.js';
import { isPanelSender, isRecord, parsePanelRequest } from './protocol.js';
import { MAX_CANDIDATES, SelectionRegistry } from './selection.js';
import { createWorkflow, type BrowserPort } from './workflow.js';

const port: BrowserPort = {
  async activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url))
      throw new Error('Open MediaAuth from the toolbar on an HTTP(S) page first.');
    return { id: tab.id, url: tab.url };
  },
  async discover(tabId) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'ISOLATED',
      func: discoverPageImages,
      args: [MAX_CANDIDATES],
    });
    if (!injection?.documentId || injection.frameId !== 0)
      throw new Error('Page inspection unavailable. Invoke the extension on this page again.');
    return { documentId: injection.documentId, value: injection.result };
  },
  async acquire(selection) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: selection.tabId, documentIds: [selection.documentId] },
      world: 'ISOLATED',
      func: acquirePageImage,
      args: [
        selection.assetUrl,
        selection.pageUrl,
        DEFAULT_LIMITS.maxBytes,
        10_000,
        DEFAULT_LIMITS.maxChunks,
      ],
    });
    const value: unknown = injection?.result;
    if (
      injection?.documentId !== selection.documentId ||
      injection.frameId !== 0 ||
      !isRecord(value)
    )
      throw new Error('The selected document is no longer available. Discover images again.');
    if (value.ok !== true)
      throw new Error(
        typeof value.reason === 'string' ? value.reason.slice(0, 500) : 'Acquisition unavailable.',
      );
    if (
      typeof value.base64 !== 'string' ||
      value.base64.length > Math.ceil(DEFAULT_LIMITS.maxBytes / 3) * 4
    )
      throw new Error('Invalid or oversized acquisition response.');
    const binary = atob(value.base64);
    if (binary.length > DEFAULT_LIMITS.maxBytes)
      throw new Error('The selected asset exceeds the byte limit.');
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  },
};

const handleRequest = createWorkflow(port, new SelectionRegistry(() => crypto.randomUUID()));

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    // open() must run directly in the toolbar user gesture, before any await.
    void chrome.sidePanel.open({ tabId: tab.id }).catch((error: unknown) => {
      console.error('MediaAuth could not open the Side Panel.', error);
    });
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isPanelSender(sender, chrome.runtime.id, chrome.runtime.getURL('panel.html'))) return false;
  const request = parsePanelRequest(message);
  if (!request) {
    respond({ kind: 'ERROR', message: 'Invalid MediaAuth request.' });
    return false;
  }
  void handleRequest(request).then(respond);
  return true;
});
