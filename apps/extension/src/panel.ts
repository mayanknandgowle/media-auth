import { analyzeSelectedFile } from './local-file.js';
import { isRecord, type PanelRequest } from './protocol.js';
import { categoryLabels, createReportView, type ReportView } from './report.js';

function element<T extends Element>(selector: string, type: { new (...args: never[]): T }): T {
  const value = document.querySelector(selector);
  if (!(value instanceof type)) throw new Error(`Missing panel element: ${selector}`);
  return value;
}
const discover = element('#discover', HTMLButtonElement);
const fileInput = element('#file', HTMLInputElement);
const status = element('#status', HTMLParagraphElement);
const candidates = element('#candidates', HTMLUListElement);
const summary = element('#summary', HTMLParagraphElement);
const result = element('#result', HTMLPreElement);
const facts = element('#facts', HTMLDListElement);
const cards = element('#evidence', HTMLDivElement);
const limitations = element('#limitations', HTMLUListElement);
const reportSection = element('#report', HTMLElement);
const empty = element('#empty', HTMLElement);
const exportButton = element('#export', HTMLButtonElement);
const clearButton = element('#clear', HTMLButtonElement);
const hash = element('#hash', HTMLElement);
const verdict = element('#verdict', HTMLHeadingElement);
let busy = false;
let currentReport: ReportView | undefined;
const metadataCards = new Map([
  ['media-auth.jpeg-exif', { title: 'JPEG EXIF fields', format: 'EXIF' }],
  ['media-auth.webp-exif', { title: 'WebP EXIF fields', format: 'EXIF' }],
  ['media-auth.png-exif', { title: 'PNG EXIF fields', format: 'EXIF' }],
  ['media-auth.jpeg-xmp', { title: 'JPEG XMP fields', format: 'XMP' }],
]);

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text: string) {
  const value = document.createElement(tag);
  value.textContent = text;
  return value;
}
function clearReport() {
  currentReport = undefined;
  result.textContent = '';
  facts.replaceChildren();
  cards.replaceChildren();
  limitations.replaceChildren();
  hash.textContent = '';
  summary.textContent = '';
  verdict.textContent = '';
  reportSection.hidden = true;
  empty.hidden = false;
  exportButton.disabled = true;
}
function setBusy(value: boolean) {
  busy = value;
  discover.disabled = value;
  fileInput.disabled = value;
  clearButton.disabled = value;
  exportButton.disabled = value || !currentReport;
  document.querySelectorAll<HTMLButtonElement>('#candidates button').forEach((button) => {
    button.disabled = value;
  });
  status.setAttribute('aria-busy', String(value));
}
function showReport(value: unknown) {
  const view = createReportView(value);
  for (const [label, text] of view.facts) facts.append(node('dt', label), node('dd', text));
  hash.textContent = view.hash ?? 'Exact identity unavailable. See the evidence below.';
  verdict.textContent = view.verdict.replaceAll('_', ' ');
  summary.textContent = view.explanation;
  for (const item of view.evidence) {
    const card = node('article', '');
    card.className = 'evidence-card';
    const top = node('div', '');
    top.className = 'card-top';
    const badge = node(
      'span',
      item.status === 'DETECTED' ? 'Observed' : item.status.replaceAll('_', ' '),
    );
    badge.className = item.status === 'DETECTED' ? 'badge observed' : 'badge';
    top.append(
      node(
        'h3',
        metadataCards.get(item.source.id)?.title ?? categoryLabels[item.category] ?? item.category,
      ),
      badge,
    );
    card.append(top, node('p', item.explanation));
    if (
      (item.status === 'UNAVAILABLE' || item.status === 'INCONCLUSIVE') &&
      item.reason !== item.explanation
    )
      card.append(node('p', item.reason));
    if (item.status === 'NOT_DETECTED') card.append(node('p', `Search scope: ${item.scope}`));
    const attribution = node(
      'p',
      `${item.source.id} · v${item.source.version} · ${item.quality.completeness.toLowerCase()} evidence`,
    );
    attribution.className = 'attribution';
    card.append(attribution);
    if (item.status === 'DETECTED') {
      if (
        metadataCards.has(item.source.id) &&
        isRecord(item.details) &&
        Array.isArray(item.details.observations)
      ) {
        const labels: Readonly<Record<string, string>> = {
          blockPresent: 'EXIF block present',
          cameraMake: 'Recorded camera make',
          cameraModel: 'Recorded camera model',
          software: 'Recorded software',
          dateTime: 'Recorded date/time',
          dateTimeOriginal: 'Recorded original date/time',
          dateTimeDigitized: 'Recorded digitized date/time',
          orientation: 'Recorded orientation (not applied)',
          pixelXDimension: 'Recorded EXIF pixel width',
          pixelYDimension: 'Recorded EXIF pixel height',
          lensMake: 'Recorded lens make',
          lensModel: 'Recorded lens model',
          packetPresent: 'XMP packet present',
          creatorTool: 'Recorded XMP creator tool',
          createDate: 'Recorded XMP creation date',
          modifyDate: 'Recorded XMP modification date',
          metadataDate: 'Recorded XMP metadata date',
        };
        const fields = node('dl', '');
        fields.className = 'facts';
        for (const observation of item.details.observations) {
          if (
            !isRecord(observation) ||
            observation.kind !== 'RECORDED' ||
            observation.format !== metadataCards.get(item.source.id)?.format ||
            typeof observation.field !== 'string'
          )
            continue;
          const label = Object.hasOwn(labels, observation.field)
            ? labels[observation.field]
            : undefined;
          const value = observation.value;
          if (
            label &&
            (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
          )
            fields.append(node('dt', label), node('dd', String(value)));
        }
        card.append(fields);
      }
      const comparison = view.dimensionComparisons.get(item.id);
      if (comparison) card.append(node('p', comparison));
      const detail = node('details', '');
      detail.append(
        node('summary', 'Recorded details'),
        node('pre', JSON.stringify(item.details, null, 2)),
      );
      card.append(detail);
    }
    cards.append(card);
  }
  for (const text of view.limitations) limitations.append(node('li', text));
  result.textContent = view.json;
  currentReport = view;
  reportSection.hidden = false;
  empty.hidden = true;
  status.textContent =
    'Local analysis complete. Unavailable evidence does not establish authenticity.';
}
async function operation(message: string, action: () => Promise<void>) {
  if (busy) return;
  setBusy(true);
  clearReport();
  status.className = '';
  status.textContent = message;
  try {
    await action();
  } catch (error) {
    clearReport();
    status.className = 'error';
    status.textContent =
      error instanceof Error
        ? error.message.slice(0, 500)
        : 'Inspection unavailable. Try another supported image.';
  } finally {
    setBusy(false);
  }
}
async function request(message: PanelRequest): Promise<void> {
  await operation(
    message.kind === 'DISCOVER'
      ? 'Looking for images in the active page…'
      : 'Reading the selected page asset and inspecting locally…',
    async () => {
      if (message.kind === 'DISCOVER') candidates.replaceChildren();
      const response: unknown = await chrome.runtime.sendMessage(message);
      if (!isRecord(response))
        throw new Error('No response. Invoke MediaAuth from the toolbar again.');
      if (response.kind === 'ERROR')
        throw new Error(
          typeof response.message === 'string' ? response.message : 'Operation unavailable.',
        );
      if (
        message.kind === 'DISCOVER' &&
        response.kind === 'DISCOVERED' &&
        Array.isArray(response.candidates) &&
        response.candidates.length <= 50
      ) {
        for (const item of response.candidates) {
          if (
            !isRecord(item) ||
            typeof item.selectionKey !== 'string' ||
            !/^[a-zA-Z0-9-]{1,100}$/.test(item.selectionKey) ||
            typeof item.label !== 'string' ||
            item.label.length > 160 ||
            typeof item.available !== 'boolean'
          )
            throw new Error('Invalid discovery response.');
          const li = node('li', '');
          if (item.available === true) {
            const button = node('button', `Analyze ${item.label}`);
            button.type = 'button';
            const selectionKey = item.selectionKey;
            button.addEventListener('click', () => {
              void request({ kind: 'ANALYZE', selectionKey });
            });
            li.append(button);
          } else
            li.textContent = `${item.label} — ${typeof item.reason === 'string' ? item.reason.slice(0, 500) : 'Unavailable'}`;
          candidates.append(li);
        }
        status.textContent = response.candidates.length
          ? `${response.candidates.length} image(s) discovered. Select one to acquire its bytes.`
          : 'No images found in the top document. Choose a local image instead.';
      } else if (response.kind === 'ANALYZED' && message.kind === 'ANALYZE')
        showReport(response.result);
      else throw new Error('Invalid response from the analysis worker.');
    },
  );
}
discover.addEventListener('click', () => {
  void request({ kind: 'DISCOVER' });
});
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.item(0);
  fileInput.value = '';
  if (!file) return;
  void operation('Reading your selected file and inspecting locally…', async () => {
    candidates.replaceChildren();
    showReport(await analyzeSelectedFile(file));
  });
});
clearButton.addEventListener('click', () => {
  if (busy) return;
  void operation('Clearing the session…', async () => {
    candidates.replaceChildren();
    fileInput.value = '';
    const response: unknown = await chrome.runtime.sendMessage({
      kind: 'CLEAR',
    } satisfies PanelRequest);
    if (!isRecord(response) || response.kind !== 'CLEARED')
      throw new Error('Could not clear page selections. Close MediaAuth to end this session.');
    status.textContent = 'Session cleared. Choose another image to inspect.';
  });
});
exportButton.addEventListener('click', () => {
  if (!currentReport || busy) return;
  const url = URL.createObjectURL(new Blob([currentReport.json], { type: 'application/json' }));
  const link = node('a', '');
  link.href = url;
  link.download = 'mediaauth-report.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
