import { readFileSync } from 'node:fs';
import { pngProbe, jpegProbe, webpProbe, gifProbe, bmpProbe } from '@media-auth/media';

const catalog = [
  { name: 'rgb24-bottom-up.bmp', probe: bmpProbe, mimeType: 'image/bmp', width: 3, height: 2 },
  { name: 'rgb24-top-down.bmp', probe: bmpProbe, mimeType: 'image/bmp', width: 3, height: 2 },
  { name: 'known.png', probe: pngProbe, mimeType: 'image/png', width: 1, height: 1 },
  { name: 'baseline.jpg', probe: jpegProbe, mimeType: 'image/jpeg', width: 16, height: 8 },
  { name: 'progressive.jpg', probe: jpegProbe, mimeType: 'image/jpeg', width: 16, height: 8 },
  { name: 'lossy.webp', probe: webpProbe, mimeType: 'image/webp', width: 16, height: 8 },
  { name: 'lossless.webp', probe: webpProbe, mimeType: 'image/webp', width: 16, height: 8 },
  { name: 'alpha.webp', probe: webpProbe, mimeType: 'image/webp', width: 16, height: 8 },
  { name: 'single87.gif', probe: gifProbe, mimeType: 'image/gif', width: 16, height: 8 },
  {
    name: 'transparent-interlaced.gif',
    probe: gifProbe,
    mimeType: 'image/gif',
    width: 16,
    height: 8,
  },
];

export function loadProbeSeeds(directory: URL) {
  return catalog.map((seed) => ({ ...seed, bytes: readFileSync(new URL(seed.name, directory)) }));
}

export type ProbeSeed = ReturnType<typeof loadProbeSeeds>[number];
