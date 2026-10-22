import { Worker } from 'node:worker_threads';
import { setTimeout, clearTimeout } from 'node:timers';

/** Test containment only: resourceLimits does not bound external/native allocations. */
export function runWorker(code, workerData, timeoutMs) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(code, {
      eval: true,
      execArgv: [], // The bundled worker is CommonJS, independent of the caller's module flags.
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
    });
    let settled = false;
    let lastCase = null;
    const timer = setTimeout(() => {
      finish(
        new Error(
          `Worker deadline exceeded after ${timeoutMs} ms; last case=${lastCase ?? 'positive controls/startup'}`,
        ),
      );
    }, timeoutMs);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().then(() => {
        if (error) reject(error);
        else resolve(result);
      }, reject);
    }
    worker.on('error', (error) => finish(error));
    worker.on('exit', (code) => finish(new Error(`Worker exited ${code} without a result`)));
    worker.on('message', (message) => {
      if (
        message?.kind === 'progress' &&
        Number.isSafeInteger(message.index) &&
        message.index >= 0
      ) {
        lastCase = message.index;
      } else if (
        message?.kind === 'result' &&
        message.result &&
        typeof message.result === 'object'
      ) {
        finish(undefined, message.result);
      } else {
        finish(new Error('Invalid stress worker message'));
      }
    });
  });
}
