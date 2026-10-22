import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';
import { DEFAULT_LIMITS } from '@media-auth/core';
import { imageProbe } from '@media-auth/media';
import { loadProbeSeeds } from './probe-seeds.js';
import { checkProbe, exerciseCase, generateCase, STRESS_VERSION } from './probe-stress.js';

async function main() {
  const data: unknown = workerData;
  assert.ok(data && typeof data === 'object');
  assert.ok('seed' in data && typeof data.seed === 'number');
  assert.ok('start' in data && typeof data.start === 'number');
  assert.ok('iterations' in data && typeof data.iterations === 'number');
  assert.ok('fixtureUrl' in data && typeof data.fixtureUrl === 'string');
  const fixtures = loadProbeSeeds(new URL(data.fixtureUrl));
  for (const fixture of fixtures) {
    for (const probe of [fixture.probe, imageProbe]) {
      assert.deepEqual(await checkProbe(probe, fixture.bytes, DEFAULT_LIMITS), {
        status: 'ACCEPT',
        mimeType: fixture.mimeType,
        width: fixture.width,
        height: fixture.height,
      });
    }
  }
  const digest = createHash('sha256');
  let accepted = 0;
  let rejected = 0;
  for (let index = data.start; index < data.start + data.iterations; index++) {
    parentPort?.postMessage({ kind: 'progress', index });
    const entry = generateCase(data.seed, index, fixtures);
    try {
      const results = await exerciseCase(entry);
      for (const result of [results.direct, results.dispatched]) {
        if (result.status === 'ACCEPT') accepted++;
        else rejected++;
      }
      digest.update(
        JSON.stringify({
          index,
          fixture: entry.fixture.name,
          sha256: entry.sha256,
          limits: entry.limits,
          results,
        }),
      );
    } catch (error) {
      throw new Error(
        `seed=${data.seed} case=${index} fixture=${entry.fixture.name} sha256=${entry.sha256}: ${error instanceof Error ? error.message : 'unknown failure'}`,
        { cause: error },
      );
    }
  }
  parentPort?.postMessage({
    kind: 'result',
    result: {
      algorithmVersion: STRESS_VERSION,
      seed: data.seed,
      start: data.start,
      iterations: data.iterations,
      controls: fixtures.length * 2,
      probeCalls: data.iterations * 2,
      accepted,
      rejected,
      digest: digest.digest('hex'),
    },
  });
}

void main().catch((error: unknown) => {
  throw error;
});
