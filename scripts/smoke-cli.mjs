import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const entries = [
  [process.execPath, ['apps/cli/dist/index.js']],
  [process.execPath, ['node_modules/@media-auth/cli/dist/index.js']],
  [process.execPath, ['apps/cli/bin/media-auth.mjs']],
  process.platform === 'win32'
    ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'node_modules\\.bin\\media-auth.cmd']]
    : ['node_modules/.bin/media-auth', []],
];

function run(command, args, expectedStatus) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, expectedStatus, `${command} ${args.join(' ')}: ${result.stderr}`);
  return result;
}

for (const [command, prefix] of entries) {
  const inspected = run(command, [...prefix, 'inspect', 'tests/fixtures/known.png'], 0);
  assert.equal(inspected.stderr, '');
  const result = JSON.parse(inspected.stdout);
  assert.equal(result.media.mimeType, 'image/png');
  assert.deepEqual(result.media.dimensions, { width: 1, height: 1 });
  assert.equal(result.conclusion.verdict, 'INCONCLUSIVE');
  assert.ok(result.analyzers.some((analyzer) => analyzer.status === 'UNAVAILABLE'));

  const hashed = run(command, [...prefix, 'fingerprint', 'tests/fixtures/known.png'], 0);
  assert.equal(hashed.stderr, '');
  assert.deepEqual(JSON.parse(hashed.stdout).identity, {
    algorithm: 'SHA-256',
    value: 'd5947f90e10810acc699524e3da32f6fb811e27788922e7409a9dd9f9e7ab984',
  });

  const invalid = run(command, [...prefix, 'inspect', 'tests/fixtures/index.html'], 1);
  assert.equal(invalid.stdout, '');
  assert.ok(JSON.parse(invalid.stderr).error.code);

  const usage = run(command, prefix, 2);
  assert.equal(usage.stdout, '');
  assert.equal(JSON.parse(usage.stderr).error.code, 'USAGE_ERROR');
}

const imported = run(
  process.execPath,
  ['--input-type=module', '--eval', "await import('./apps/cli/dist/index.js')"],
  0,
);
assert.equal(imported.stdout, '');
assert.equal(imported.stderr, '');
console.log(
  'CLI smoke passed: direct, workspace alias, npm bin, structured output/errors, safe import.',
);
