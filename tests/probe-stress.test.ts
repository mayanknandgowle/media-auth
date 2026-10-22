import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, MediaAuthError, type MediaProbe } from '@media-auth/core';
import { loadProbeSeeds } from './probe-seeds.js';
import { checkProbe, exerciseCase, generateCase, MAX_INPUT } from './probe-stress.js';

const fixtures = loadProbeSeeds(new URL('./fixtures/', import.meta.url));
const script = fileURLToPath(new URL('../scripts/stress-probes.mjs', import.meta.url));
const controller = new URL('../scripts/probe-stress-runner.mjs', import.meta.url).href;
function command(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
}

describe('seeded probe stress', () => {
  it('replays independently and keeps all generated inputs bounded without changing seeds', async () => {
    const originals = fixtures.map((f) => Buffer.from(f.bytes));
    const first = generateCase(42, 37, fixtures);
    const hashes = new Set<string>();
    const lengths = new Set<number>();
    for (let index = 0; index < 500; index++) {
      const entry = generateCase(42, index, fixtures);
      expect(entry.bytes.length).toBeLessThanOrEqual(MAX_INPUT);
      hashes.add(entry.sha256);
      lengths.add(entry.bytes.length);
      await exerciseCase(entry);
    }
    expect(hashes.size).toBeGreaterThan(200);
    expect(lengths.size).toBeGreaterThan(100);
    expect(generateCase(42, 37, fixtures)).toEqual(first);
    expect(generateCase(43, 37, fixtures).sha256).not.toEqual(first.sha256);
    expect(fixtures.map((f) => f.bytes)).toEqual(originals);
  });

  it('fails on unexpected exceptions and adapter violations even when swallowed', async () => {
    const crash: MediaProbe = {
      id: 'crash',
      async probe() {
        throw new TypeError('unexpected');
      },
    };
    await expect(checkProbe(crash, new Uint8Array(10), DEFAULT_LIMITS)).rejects.toThrow();
    for (const [offset, length] of [
      [-1, 1],
      [0, 0],
      [9, 2],
      [0, 5],
    ]) {
      const malicious: MediaProbe = {
        id: 'invalid-read',
        async probe(handle) {
          try {
            await handle.read?.(offset ?? 0, length ?? 0);
          } catch {
            /* Simulate swallowed guard. */
          }
          throw new MediaAuthError('INVALID_INPUT', 'masked');
        },
      };
      await expect(
        checkProbe(malicious, new Uint8Array(10), { ...DEFAULT_LIMITS, maxChunkBytes: 4 }),
      ).rejects.toThrow();
    }
    const flood: MediaProbe = {
      id: 'flood',
      async probe(handle) {
        for (let i = 0; i < 70; i++) await handle.read?.(0, 1);
        throw new MediaAuthError('INVALID_INPUT', 'ended');
      },
    };
    await expect(checkProbe(flood, new Uint8Array(1), DEFAULT_LIMITS)).rejects.toThrow(
      'read count',
    );
  });

  it('allows dispatch to recognize a different valid format after a splice', async () => {
    const png = fixtures.find((f) => f.mimeType === 'image/png');
    const gif = fixtures.find((f) => f.mimeType === 'image/gif');
    if (!png || !gif) throw new Error('Missing fixture');
    const result = await exerciseCase({
      ...generateCase(1, 0, fixtures),
      fixture: png,
      bytes: gif.bytes,
      limits: DEFAULT_LIMITS,
    });
    expect(result.direct.status).toBe('UNSUPPORTED_MEDIA');
    expect(result.dispatched).toMatchObject({ status: 'ACCEPT', mimeType: 'image/gif' });
  });

  it('reports deterministic CLI replay and successful bounded campaigns', () => {
    const args = ['--seed', '1', '--case', '37'];
    const first = command(args);
    const second = command(args);
    expect(first.error).toBeUndefined();
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(first.stderr).toBe('');
    // Pin algorithm-1 replay; change deliberately if fixtures, policies, or probe outcomes change.
    expect(JSON.parse(first.stdout).digest).toBe(
      'e08d90611e82f5393e8462e5660cb36d789ae5a738e37cd980f0ad9cf92ec9d0',
    );
    expect(JSON.parse(first.stdout)).toMatchObject({
      seed: 1,
      start: 37,
      iterations: 1,
      controls: 20,
      probeCalls: 2,
    });
    const run = command(['--seed', '4294967295', '--iterations', '100']);
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      iterations: 100,
      probeCalls: 200,
      controls: 20,
    });
  }, 20_000);

  it.each([
    ['--seed', '-1'],
    ['--seed', '4294967296'],
    ['--case', '1000000'],
    ['--iterations', '0'],
    ['--iterations', '10001'],
    ['--iterations', 'NaN'],
    ['--timeout-ms', '0'],
    ['--timeout-ms', '120001'],
    ['--seed'],
    ['--wat', '1'],
    ['--seed', '1', '--seed', '2'],
    ['--case', '1', '--iterations', '1'],
  ])('rejects invalid options %j', (...args) => {
    const result = command(args);
    expect(result.status, result.stderr).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toHaveProperty('error', 'USAGE_ERROR');
  });

  it.each([
    ['while (true) {}', 'deadline'],
    ["throw new Error('test crash')", 'test crash'],
    ['process.exit(0)', 'without a result'],
    [
      "require('node:worker_threads').parentPort.postMessage({oops:true})",
      'Invalid stress worker message',
    ],
  ])('terminates or rejects faulty workers: %s', (code, expected) => {
    const deadline = expected === 'deadline' ? 250 : 2000;
    const program = `import { runWorker } from ${JSON.stringify(controller)};\ntry { await runWorker(${JSON.stringify(code)}, {}, ${deadline}); process.exitCode=1; } catch(e) { console.log(e.message); }`;
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
      encoding: 'utf8',
      timeout: 5000,
    });
    expect(output).toContain(expected);
  });
});
