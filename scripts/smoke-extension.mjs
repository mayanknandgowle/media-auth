/* global chrome, document, window */
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { fixtureServer } from './serve-fixture.mjs';

// Browser automation cannot grant activeTab or reliably drive Chromium's native toolbar.
// Verify the production manifest separately, then use an explicitly disclosed,
// disposable loopback host grant to exercise the unchanged production UI and worker.
const extensionPath = resolve(process.env.MEDIAAUTH_EXTENSION_PATH ?? 'apps/extension/dist');
const temporaryRoot = await mkdtemp(join(tmpdir(), 'media-auth-extension-smoke-'));
const contexts = [];
const server = fixtureServer();
let imageRequests = 0;
let allImageRequests = 0;
server.on('request', (request) => {
  if (request.url === '/known.png') imageRequests++;
  if (/\.(png|jpg|webp|gif|bmp)$/.test(request.url ?? '')) allImageRequests++;
});
await new Promise((resolveListen, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
if (address === null || typeof address === 'string')
  throw new Error('Fixture server did not bind a TCP port.');
const fixtureUrl = `http://127.0.0.1:${address.port}/`;

async function launch(path, profile) {
  const context = await chromium.launchPersistentContext(join(temporaryRoot, profile), {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
  });
  contexts.push(context);
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
  const extensionId = new URL(worker.url()).host;
  return { context, worker, panelUrl: `chrome-extension://${extensionId}/panel.html` };
}

async function openFixtureAndPanel(context, panelUrl) {
  const fixture = await context.newPage();
  await fixture.goto(fixtureUrl);
  await expect(fixture.getByAltText('Known blue PNG fixture')).toBeVisible();
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 480, height: 900 });
  await panel.goto(panelUrl);
  await expect(panel.locator('#discover')).toBeVisible();
  await fixture.bringToFront();
  return { fixture, panel };
}

try {
  const production = await launch(extensionPath, 'production-profile');
  const manifest = await production.worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'scripting', 'sidePanel']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  const panelOptions = await production.worker.evaluate(() => chrome.sidePanel.getOptions({}));
  assert.equal(panelOptions.path, 'panel.html');
  const productionPages = await openFixtureAndPanel(production.context, production.panelUrl);
  await productionPages.panel.locator('#discover').evaluate((button) => button.click());
  await expect(productionPages.panel.locator('#status')).toContainText('toolbar');
  const localPanel = productionPages.panel;
  const errors = [];
  localPanel.on('pageerror', (error) => errors.push(error.message));
  const beforeLocal = allImageRequests;
  for (const [name, mime] of [
    ['known.png', 'image/png'],
    ['baseline.jpg', 'image/jpeg'],
    ['progressive.jpg', 'image/jpeg'],
    ['lossy.webp', 'image/webp'],
    ['lossless.webp', 'image/webp'],
    ['alpha.webp', 'image/webp'],
    ['single87.gif', 'image/gif'],
    ['transparent-interlaced.gif', 'image/gif'],
    ['rgb24-bottom-up.bmp', 'image/bmp'],
    ['rgb24-top-down.bmp', 'image/bmp'],
  ]) {
    await localPanel.locator('#file').setInputFiles(resolve('tests/fixtures', name));
    await expect(localPanel.locator('#facts')).toContainText(name);
    await expect(localPanel.locator('#status')).toContainText('Local analysis complete');
    await expect(localPanel.locator('#evidence .evidence-card')).toHaveCount(7);
    const local = JSON.parse(await localPanel.locator('#result').textContent());
    assert.equal(local.media.mimeType, mime);
    assert.equal(local.media.source.acquisition, 'LOCAL_FILE');
    assert.equal(local.conclusion.verdict, 'INCONCLUSIVE');
  }
  assert.equal(allImageRequests, beforeLocal, 'Local inspection must not fetch page/media URLs.');
  const downloadPromise = localPanel.waitForEvent('download');
  await localPanel.locator('#export').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  assert.deepEqual(
    JSON.parse(await readFile(downloadPath, 'utf8')),
    JSON.parse(await localPanel.locator('#result').textContent()),
  );
  assert.equal(download.suggestedFilename(), 'mediaauth-report.json');
  await localPanel.locator('#clear').click();
  await expect(localPanel.locator('#status')).toContainText('Session cleared');
  await expect(localPanel.locator('#export')).toBeDisabled();
  assert.equal(await localPanel.locator('#result').textContent(), '');
  await localPanel.locator('#file').setInputFiles({
    name: '<img onerror=alert(1)>.png',
    mimeType: 'image/png',
    buffer: await readFile('tests/fixtures/known.png'),
  });
  await expect(localPanel.locator('#facts')).toContainText('<img onerror=alert(1)>.png');
  assert.equal(await localPanel.locator('#facts img').count(), 0);
  await localPanel.locator('#file').setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg></svg>'),
  });
  await expect(localPanel.locator('#status')).toContainText('supported');
  await expect(localPanel.locator('#export')).toBeDisabled();
  await expect(localPanel.locator('#report')).toBeHidden();
  await localPanel.locator('#file').setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  });
  await expect(localPanel.locator('#status')).toContainText('8 MiB');
  await localPanel.locator('#file').setInputFiles('tests/fixtures/known.png');
  await expect(localPanel.locator('#status')).toContainText('Local analysis complete');
  await mkdir('test-results', { recursive: true });
  await localPanel.setViewportSize({ width: 320, height: 900 });
  assert.ok(
    await localPanel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Narrow panel must not overflow horizontally.',
  );
  await localPanel.screenshot({
    path: 'test-results/image-inspector-local-320.png',
    fullPage: true,
  });
  await localPanel.setViewportSize({ width: 640, height: 900 });
  await localPanel.screenshot({
    path: 'test-results/image-inspector-local-640.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: production MV3 loads, page access requires a grant, all ten fixtures inspect locally without activeTab, JSON download/clear/errors and narrow layouts work.',
  );
  await production.context.close();

  const harnessPath = join(temporaryRoot, 'loopback-test-extension');
  await cp(extensionPath, harnessPath, { recursive: true });
  const harnessManifest = JSON.parse(await readFile(join(harnessPath, 'manifest.json'), 'utf8'));
  harnessManifest.name += ' (loopback browser test)';
  harnessManifest.host_permissions = ['http://127.0.0.1/*'];
  await writeFile(
    join(harnessPath, 'manifest.json'),
    `${JSON.stringify(harnessManifest, null, 2)}\n`,
  );
  const harness = await launch(harnessPath, 'integration-profile');
  const { fixture, panel } = await openFixtureAndPanel(harness.context, harness.panelUrl);
  const beforeDiscovery = imageRequests;
  await panel.locator('#discover').evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('1 image(s) discovered');
  assert.equal(imageRequests, beforeDiscovery, 'Discovery must not fetch media bytes.');
  await panel
    .getByRole('button', { name: 'Analyze Known blue PNG fixture' })
    .evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('Local analysis complete', {
    timeout: 20_000,
  });
  assert.equal(
    imageRequests,
    beforeDiscovery + 1,
    'Only the selected media asset should be fetched.',
  );
  const report = JSON.parse(await panel.locator('#result').textContent());
  assert.equal(report.media.source.acquisition, 'ORIGINAL_WEB_ASSET');
  assert.equal(report.media.mimeType, 'image/png');
  assert.equal(report.conclusion.verdict, 'INCONCLUSIVE');
  assert.ok(
    report.evidence.some(
      (item) => item.category === 'EXACT_IDENTITY' && item.status === 'DETECTED',
    ),
  );
  for (const category of ['PROVENANCE', 'AI_GENERATION', 'MANIPULATION', 'WATERMARK']) {
    assert.ok(
      report.evidence.some((item) => item.category === category && item.status === 'UNAVAILABLE'),
    );
  }
  assert.ok(
    JSON.stringify(report).includes(
      'd5947f90e10810acc699524e3da32f6fb811e27788922e7409a9dd9f9e7ab984',
    ),
  );
  await mkdir('test-results', { recursive: true });
  await panel.screenshot({ path: 'test-results/extension-panel.png' });
  await fixture.reload();
  await panel
    .getByRole('button', { name: 'Analyze Known blue PNG fixture' })
    .evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('document');
  await panel.locator('#discover').evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('1 image(s) discovered');
  await fixture.goto(`${fixtureUrl}#navigated`);
  await panel
    .getByRole('button', { name: 'Analyze Known blue PNG fixture' })
    .evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('page changed');
  await fixture.goto(`${fixtureUrl}gallery`);
  await fixture.bringToFront();
  const beforeGallery = allImageRequests;
  await panel.locator('#discover').evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('10 image(s) discovered');
  assert.equal(allImageRequests, beforeGallery, 'Gallery discovery must not fetch any asset.');
  for (const name of [
    'known.png',
    'baseline.jpg',
    'progressive.jpg',
    'lossy.webp',
    'lossless.webp',
    'alpha.webp',
    'single87.gif',
    'transparent-interlaced.gif',
    'rgb24-bottom-up.bmp',
    'rgb24-top-down.bmp',
  ]) {
    const count = allImageRequests;
    await panel
      .getByRole('button', { name: `Analyze ${name}`, exact: true })
      .evaluate((button) => button.click());
    await expect(panel.locator('#status')).toContainText('Local analysis complete');
    const pageReport = JSON.parse(await panel.locator('#result').textContent());
    assert.equal(pageReport.media.source.acquisition, 'ORIGINAL_WEB_ASSET');
    assert.equal(allImageRequests, count + 1, 'Each selection must acquire exactly one asset.');
  }
  await panel.locator('#clear').evaluate((button) => button.click());
  await expect(panel.locator('#status')).toContainText('Session cleared');
  assert.equal(await panel.locator('#candidates button').count(), 0);
  console.log(
    'PASS: production panel/worker discover and inspect all ten page fixtures with a disposable loopback grant; only selected assets are acquired, stale selections are rejected, and clear forgets candidates.',
  );
  console.log(
    'NOT VERIFIED: native toolbar activation, the real activeTab grant, and native Side Panel hosting. Complete the manual procedure in apps/extension/README.md.',
  );
} catch (error) {
  console.error('Extension browser smoke FAILED or NOT VERIFIED:', error);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await new Promise((resolveClose) => server.close(resolveClose));
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  if (
    !resolvedTemporaryRoot.startsWith(`${resolve(tmpdir())}${sep}`) ||
    !resolvedTemporaryRoot.includes(`${sep}media-auth-extension-smoke-`)
  ) {
    console.error('Refusing unsafe temporary directory cleanup.');
    process.exitCode = 1;
  } else {
    await rm(resolvedTemporaryRoot, { recursive: true, force: true });
  }
}
