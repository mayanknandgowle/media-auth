import type { AnalysisResult } from '@media-auth/core';

export type PanelRequest =
  { readonly kind: 'DISCOVER' } | { readonly kind: 'ANALYZE'; readonly selectionKey: string };
export interface ImageCandidate {
  readonly selectionKey: string;
  readonly label: string;
  readonly available: boolean;
  readonly reason?: string;
}
export type PanelResponse =
  | { readonly kind: 'DISCOVERED'; readonly candidates: readonly ImageCandidate[] }
  | { readonly kind: 'ANALYZED'; readonly result: AnalysisResult }
  | { readonly kind: 'ERROR'; readonly message: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** No URL, tab, frame, or acquisition options are accepted over the message boundary. */
export function parsePanelRequest(value: unknown): PanelRequest | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (value.kind === 'DISCOVER' && keys.length === 1) return { kind: 'DISCOVER' };
  if (
    value.kind === 'ANALYZE' &&
    keys.length === 2 &&
    typeof value.selectionKey === 'string' &&
    /^[a-zA-Z0-9-]{1,100}$/.test(value.selectionKey)
  ) {
    return { kind: 'ANALYZE', selectionKey: value.selectionKey };
  }
  return undefined;
}

export function isPanelSender(
  sender: { readonly id?: string; readonly url?: string },
  extensionId: string,
  panelUrl: string,
): boolean {
  return sender.id === extensionId && sender.url === panelUrl;
}
