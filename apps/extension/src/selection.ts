import { isRecord, type ImageCandidate } from './protocol.js';

export const MAX_CANDIDATES = 50;
export interface Selection {
  readonly tabId: number;
  readonly documentId: string;
  readonly pageUrl: string;
  readonly assetUrl: string;
}

function httpUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

/** One ephemeral, bounded discovery session. Navigation and worker restart invalidate selections. */
export class SelectionRegistry {
  private selections = new Map<string, Selection>();
  private expiresAt = 0;

  constructor(
    private readonly token: () => string,
    private readonly now: () => number = Date.now,
  ) {}

  register(tabId: number, documentId: string, value: unknown): readonly ImageCandidate[] {
    this.clear();
    if (
      !Number.isInteger(tabId) ||
      !documentId ||
      !isRecord(value) ||
      !Array.isArray(value.images) ||
      value.images.length > MAX_CANDIDATES
    )
      throw new Error('Invalid discovery response.');
    const pageUrl = httpUrl(value.pageUrl);
    if (!pageUrl) throw new Error('Only HTTP(S) pages are supported.');
    const session = this.token();
    const candidates: ImageCandidate[] = [];
    for (const [index, image] of value.images.entries()) {
      if (
        !isRecord(image) ||
        typeof image.url !== 'string' ||
        typeof image.label !== 'string' ||
        image.label.length > 160 ||
        image.url.length > 4096
      )
        throw new Error('Invalid discovered image.');
      const assetUrl = httpUrl(image.url);
      const selectionKey = `${session}-${index}`;
      if (assetUrl?.origin === pageUrl.origin) {
        this.selections.set(selectionKey, {
          tabId,
          documentId,
          pageUrl: pageUrl.href,
          assetUrl: assetUrl.href,
        });
        candidates.push({ selectionKey, label: image.label, available: true });
      } else {
        candidates.push({
          selectionKey,
          label: image.label,
          available: false,
          reason: 'Unavailable: cross-origin, blob, data, or unsupported URL.',
        });
      }
    }
    this.expiresAt = this.now() + 5 * 60 * 1000;
    return candidates;
  }

  select(selectionKey: string, tabId: number, pageUrl: string): Selection {
    if (this.now() >= this.expiresAt) {
      this.clear();
      throw new Error('Selection expired. Discover images again.');
    }
    const selection = this.selections.get(selectionKey);
    if (!selection || selection.tabId !== tabId || selection.pageUrl !== pageUrl)
      throw new Error('Selection unavailable or page changed. Discover images again.');
    return selection;
  }

  clear(): void {
    this.selections.clear();
    this.expiresAt = 0;
  }
}
