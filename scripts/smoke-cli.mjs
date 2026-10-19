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
  for (const [name, hash, width = 16, height = 8] of [
    [
      'rgb24-bottom-up.bmp',
      'd2ac58154b7f4dc8d4c11f341c496bfb9196bcc26008a27d9bb355e6b7ca557e',
      3,
      2,
    ],
    [
      'rgb24-top-down.bmp',
      'ded661978ff5d07c46a90105f5a70403d3522eec427b9bcdebefba0f116e4df2',
      3,
      2,
    ],
    ['baseline.jpg', '54264ccfe6f621aa45c147b6ac4f6b829ad7165545cf2e1a27a06e0be515775d'],
    ['progressive.jpg', 'f221219ce29cf87f8933a6f758c344ca94aa5f7524ae74943210b119f7be0b8e'],
    ['lossy.webp', 'fc3927eee0346e9c0ac714b66e4d157b7b5e15d1d1825e5f7ee301e9ea1a6d7a'],
    ['lossless.webp', 'f06216831f617441ac07a9fe1f8d49f91e62526b971eee3c06933b75a3411284'],
    ['alpha.webp', '3fa682dc8d44a3252ace27090c81b2a72e5e67ba64332c0867ea84ea5f25bd38'],
    ['single87.gif', '53bec4343a894b85430d2c4e31e221ea2ed0a46ee79bf1a0c0178b6290079bd7'],
    [
      'transparent-interlaced.gif',
      '440c19877aafda5bcc89dd22a7cd1e7a505047845cc15ad8cefa2cabbedcba47',
    ],
  ]) {
    const probed = run(command, [...prefix, 'probe', `tests/fixtures/${name}`], 0);
    assert.equal(probed.stderr, '');
    const descriptor = JSON.parse(probed.stdout);
    assert.deepEqual(Object.keys(descriptor).sort(), ['media', 'schemaVersion']);
    assert.equal(
      descriptor.media.mimeType,
      name.endsWith('.bmp')
        ? 'image/bmp'
        : name.endsWith('.gif')
          ? 'image/gif'
          : name.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg',
    );
    assert.deepEqual(descriptor.media.dimensions, { width, height });
    const inspected = run(command, [...prefix, 'inspect', `tests/fixtures/${name}`], 0);
    assert.equal(inspected.stderr, '');
    const analysis = JSON.parse(inspected.stdout);
    assert.equal(analysis.conclusion.verdict, 'INCONCLUSIVE');
    assert.equal(analysis.analyzers.filter((item) => item.status === 'UNAVAILABLE').length, 5);
    assert.equal(
      analysis.evidence.find((item) => item.category === 'EXACT_IDENTITY').details.value,
      hash,
    );
  }
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
