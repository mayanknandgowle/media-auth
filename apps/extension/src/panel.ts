import { isRecord, type PanelRequest } from './protocol.js';

const discover = document.querySelector('#discover');
const status = document.querySelector('#status');
const candidates = document.querySelector('#candidates');
const summary = document.querySelector('#summary');
const result = document.querySelector('#result');

if (!(discover instanceof HTMLButtonElement) || !status || !candidates || !summary || !result)
  throw new Error('Panel elements missing.');

let busy = false;
async function request(message: PanelRequest): Promise<void> {
  if (
    busy ||
    !(discover instanceof HTMLButtonElement) ||
    !status ||
    !candidates ||
    !summary ||
    !result
  )
    return;
  busy = true;
  discover.disabled = true;
  candidates.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  status.textContent =
    message.kind === 'DISCOVER'
      ? 'Inspecting images in the current page…'
      : 'Acquiring the selected asset and analyzing locally…';
  result.textContent = '';
  summary.textContent = 'No completed analysis.';
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    if (!isRecord(response)) throw new Error('No response. Invoke the toolbar action again.');
    if (response.kind === 'ERROR')
      throw new Error(
        typeof response.message === 'string' ? response.message : 'Operation unavailable.',
      );
    if (response.kind === 'DISCOVERED' && Array.isArray(response.candidates)) {
      candidates.replaceChildren();
      for (const item of response.candidates) {
        if (
          !isRecord(item) ||
          typeof item.selectionKey !== 'string' ||
          typeof item.label !== 'string'
        )
          continue;
        const li = document.createElement('li');
        if (item.available === true) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = `Analyze ${item.label}`;
          const selectionKey = item.selectionKey;
          button.addEventListener('click', () => {
            void request({ kind: 'ANALYZE', selectionKey });
          });
          li.append(button);
        } else {
          li.textContent = `${item.label} — ${typeof item.reason === 'string' ? item.reason : 'Unavailable'}`;
        }
        candidates.append(li);
      }
      status.textContent = `${response.candidates.length} image(s) discovered. Select one to acquire its bytes.`;
    } else if (response.kind === 'ANALYZED' && isRecord(response.result)) {
      result.textContent = JSON.stringify(response.result, null, 2);
      const conclusion = response.result.conclusion;
      summary.textContent =
        isRecord(conclusion) &&
        typeof conclusion.verdict === 'string' &&
        typeof conclusion.explanation === 'string'
          ? `${conclusion.verdict}: ${conclusion.explanation}`
          : 'Structured evidence is shown below.';
      status.textContent =
        'Local analysis complete. UNAVAILABLE means that evidence was not obtainable; it is not a negative finding.';
    } else {
      throw new Error('Invalid response from analysis worker.');
    }
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Operation unavailable.';
  } finally {
    busy = false;
    discover.disabled = false;
    candidates.querySelectorAll('button').forEach((button) => {
      button.disabled = false;
    });
  }
}

discover.addEventListener('click', () => {
  void request({ kind: 'DISCOVER' });
});
