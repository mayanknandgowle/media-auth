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
    [
      'metadata/exif-little.jpg',
      'b3504616bcf37c51c6e6cbf5630a2f49adbf62acb61c6338371d4b17e1eeaeca',
    ],
    ['metadata/exif-big.jpg', 'b9f6c769bc8890fac5d9c6addb83f1123cf082898f31233826cd10d8ad88e459'],
    [
      'metadata/exif-little.webp',
      'e4502e792dffeadc50ae5558ae1629e174be33e60172ae3a3ed81cda3689872f',
    ],
    ['metadata/exif-big.webp', '1bf903d607cee3c0daec9e0e7d34fc7b273bb669c26950f3256eb86fce7d7b49'],
    [
      'metadata/exif-little.png',
      '0d640af34e012a426237fd91ffdb589fa8dd395f0f19f44b1cb109e8f9d16dbf',
    ],
    ['metadata/exif-big.png', 'd97eb34cf3b475abade086f9890f5fff1773681cfca17bd451754d05f98ecaa8'],
    [
      'metadata/xmp-attributes.jpg',
      'ec101ba530262de76b6ddeb122b87f058916f025c65049e15fed82d2adbd666b',
    ],
    [
      'metadata/xmp-elements.jpg',
      'b00b456634ed18927b006a0e7f23de0b2cba7f16d7e37549bf08270c3f530e33',
    ],
    [
      'metadata/dimensions-match.jpg',
      'fe1b91713ffe765e8325256264767fe5fb655bc26551ca4a68f2191ac4e945a1',
    ],
    [
      'metadata/dimensions-different.jpg',
      '871b289ef369cdf352d14c1bcce0c2d7abda9b5e5bf360b46581c4d24f23d405',
    ],
    [
      'metadata/dimensions-match.webp',
      '994e08d99dc8f476a29b65c244051892f768ddf480c3fcc420ded151930d7976',
    ],
    [
      'metadata/dimensions-different.webp',
      '5fb43f8b1008fc92bf75c259f9c328f971e92b1022bf82f858109801a20c9ce3',
    ],
    [
      'metadata/dimensions-match.png',
      'ec37cdec8844051d019672a983bd5ea456763006750d3b92e7117e282db6e91f',
    ],
    [
      'metadata/dimensions-different.png',
      'efcc09206b69172e886f520f292a1862dce642a2b98626669b683937e087a572',
    ],
    ['lossy.webp', 'fc3927eee0346e9c0ac714b66e4d157b7b5e15d1d1825e5f7ee301e9ea1a6d7a'],
    [
      'metadata/xmp-attributes.webp',
      '8a71b34f5f900886ee0adf4a1f514e0aeaac75aadaada48c1a524ccbedda4c5a',
    ],
    [
      'metadata/xmp-elements.webp',
      '7a0d604fbe00c06e78b5f54ab2f93b499be1d50f68fc062fe28c823b6eadcdcc',
    ],
    [
      'metadata/xmp-attributes.png',
      '974dbacddeabacf379b0c2068ee7d8bc0e87f03fa922e0b6fdcadd6343a54c4c',
    ],
    [
      'metadata/xmp-elements.png',
      'e0249f3f654eeeb51889dadfe00f6afaf8a658af3c23451f7390ca98ebedcd34',
    ],
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
      name.endsWith('.png')
        ? 'image/png'
        : name.endsWith('.bmp')
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
    assert.equal(
      analysis.analyzers.filter((item) => item.status === 'UNAVAILABLE').length,
      ['.jpg', '.webp', '.png'].some((extension) => name.endsWith(extension)) ? 9 : 11,
    );
    const exif = analysis.evidence.find(
      (item) =>
        item.source.id ===
        `media-auth.${name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpeg'}-exif`,
    );
    assert.equal(
      exif.status,
      name.startsWith('metadata/')
        ? 'DETECTED'
        : ['.jpg', '.webp', '.png'].some((extension) => name.endsWith(extension))
          ? 'NOT_DETECTED'
          : 'UNAVAILABLE',
    );
    if (name.startsWith('metadata/')) {
      assert.equal(descriptor.media.metadataAvailability, 'NOT_PROBED');
      assert.ok(
        exif.details.observations.some(
          (item) => item.field === 'cameraModel' && item.value === 'Fixture Camera',
        ),
      );
      assert.equal(
        exif.details.dimensionComparison.status,
        name.includes('/dimensions-')
          ? name.includes('-different')
            ? 'DIFFERENT'
            : 'MATCH'
          : 'NOT_COMPARABLE',
      );
      assert.equal(analysis.conclusion.modification, 'UNKNOWN');
    }

    for (const [carrier, extension] of [
      ['jpeg', '.jpg'],
      ['webp', '.webp'],
      ['png', '.png'],
    ]) {
      const xmp = analysis.evidence.find(
        (item) => item.source.id === 'media-auth.' + carrier + '-xmp',
      );
      assert.equal(
        xmp.status,
        name.endsWith(extension)
          ? name.includes('/xmp-')
            ? 'DETECTED'
            : 'NOT_DETECTED'
          : 'UNAVAILABLE',
      );
      if (xmp.status === 'DETECTED') {
        assert.equal(xmp.details.dimensionComparison, undefined);
        assert.equal(xmp.details.observations.length, 5);
        assert.ok(
          xmp.details.observations.some(
            (item) =>
              item.field === 'creatorTool' && item.value === 'MediaAuth <fixture> & café 📷',
          ),
        );
      }
    }
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
