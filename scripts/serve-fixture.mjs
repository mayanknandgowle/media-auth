import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const routes = new Map([
  ['/', ['tests/fixtures/index.html', 'text/html; charset=utf-8']],
  ['/known.png', ['tests/fixtures/known.png', 'image/png']],
  ['/gallery', ['tests/fixtures/gallery.html', 'text/html; charset=utf-8']],
]);
// Explicit original assets only. Never map a request path to arbitrary filesystem access.
for (const [name, mime] of [
  ['baseline.jpg', 'image/jpeg'],
  ['progressive.jpg', 'image/jpeg'],
  ['metadata/exif-little.jpg', 'image/jpeg'],
  ['metadata/exif-big.jpg', 'image/jpeg'],
  ['metadata/exif-little.webp', 'image/webp'],
  ['metadata/exif-big.webp', 'image/webp'],
  ['metadata/exif-little.png', 'image/png'],
  ['metadata/exif-big.png', 'image/png'],
  ['lossy.webp', 'image/webp'],
  ['lossless.webp', 'image/webp'],
  ['alpha.webp', 'image/webp'],
  ['single87.gif', 'image/gif'],
  ['transparent-interlaced.gif', 'image/gif'],
  ['rgb24-bottom-up.bmp', 'image/bmp'],
  ['rgb24-top-down.bmp', 'image/bmp'],
])
  routes.set(`/${name}`, [`tests/fixtures/${name}`, mime]);
export function fixtureServer() {
  return createServer(async (request, response) => {
    const route = routes.get(request.url);
    if (request.method !== 'GET' || !route) {
      response.writeHead(404);
      response.end();
      return;
    }
    try {
      const body = await readFile(route[0]);
      response.writeHead(200, {
        'Content-Type': route[1],
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
}
if (process.argv[1]?.endsWith('serve-fixture.mjs'))
  fixtureServer().listen(4173, '127.0.0.1', () =>
    console.log('Fixture: http://127.0.0.1:4173 (Ctrl+C to stop)'),
  );
