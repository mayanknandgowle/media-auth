import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const options = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
  legalComments: 'eof',
};
if (process.argv[2] !== 'extension') {
  await build({
    ...options,
    entryPoints: ['apps/cli/src/index.ts'],
    outfile: 'apps/cli/dist/index.js',
    platform: 'node',
    format: 'esm',
  });
  for (const name of ['core', 'media', 'analyzers']) {
    await build({
      ...options,
      entryPoints: [`packages/${name}/src/index.ts`],
      outfile: `packages/${name}/dist/index.js`,
      platform: 'neutral',
      format: 'esm',
      packages: 'external',
    });
  }
}
await build({
  ...options,
  entryPoints: ['apps/extension/src/background.ts', 'apps/extension/src/panel.ts'],
  outdir: 'apps/extension/dist',
  platform: 'browser',
  format: 'esm',
});
await mkdir('apps/extension/dist', { recursive: true });
await cp('apps/extension/public', 'apps/extension/dist', { recursive: true });
