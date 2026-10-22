import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { runWorker } from './probe-stress-runner.mjs';

function options(args) {
  const allowed = new Set(['--seed', '--iterations', '--case', '--timeout-ms']);
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!allowed.has(key) || values.has(key) || !/^(0|[1-9][0-9]*)$/.test(value ?? ''))
      throw new Error(
        'Use unique --seed, --iterations, --case, --timeout-ms options with decimal integers.',
      );
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new Error('Option is not a safe integer.');
    values.set(key, parsed);
  }
  if (values.has('--case') && values.has('--iterations'))
    throw new Error('--case and --iterations are mutually exclusive.');
  const seed = values.get('--seed') ?? 1;
  const start = values.get('--case') ?? 0;
  const iterations = values.has('--case') ? 1 : (values.get('--iterations') ?? 1000);
  const timeoutMs = values.get('--timeout-ms') ?? 30_000;
  if (
    seed > 0xffffffff ||
    start > 999_999 ||
    iterations < 1 ||
    iterations > 10_000 ||
    timeoutMs < 100 ||
    timeoutMs > 120_000
  )
    throw new Error(
      'Limits: seed 0..4294967295, case 0..999999, iterations 1..10000, timeout-ms 100..120000.',
    );
  return { seed, start, iterations, timeoutMs };
}

let config;
try {
  config = options(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({ error: 'USAGE_ERROR', message: error.message }));
  process.exitCode = 2;
}
if (config) {
  try {
    const bundled = await build({
      entryPoints: [fileURLToPath(new URL('../tests/probe-stress-worker.ts', import.meta.url))],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      target: 'node24',
      logLevel: 'silent',
    });
    const result = await runWorker(
      bundled.outputFiles[0].text,
      {
        seed: config.seed,
        start: config.start,
        iterations: config.iterations,
        fixtureUrl: new URL('../tests/fixtures/', import.meta.url).href,
      },
      config.timeoutMs,
    );
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      JSON.stringify({ error: 'STRESS_FAILURE', seed: config.seed, message: error.message }),
    );
    process.exitCode = 1;
  }
}
