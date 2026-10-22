import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';

// Minimal stored ZIP for this fixed trusted file list. Not a general archive/file-input API.
// Reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
const entries = [
  ['manifest.json', 'apps/extension/dist/manifest.json'],
  ['panel.html', 'apps/extension/dist/panel.html'],
  ['panel.css', 'apps/extension/dist/panel.css'],
  ['panel.js', 'apps/extension/dist/panel.js'],
  ['background.js', 'apps/extension/dist/background.js'],
  ['GETTING_STARTED.md', 'GETTING_STARTED.md'],
  ['LICENSE', 'LICENSE'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
];
const records = [];
const directory = [];
let offset = 0;
for (const [name, path] of entries) {
  const data = await readFile(path);
  if (data.length > 2 * 1024 * 1024) throw new Error(`Unexpected package file size: ${name}`);
  const filename = Buffer.from(name, 'ascii');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(33, 12); // Fixed DOS date: 1980-01-01; time zero, independent of filesystem/OS.
  local.writeUInt32LE(crc32(data), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(33, 14);
  central.writeUInt32LE(crc32(data), 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28);
  central.writeUInt32LE(offset, 42);
  records.push(local, filename, data);
  directory.push(central, filename);
  offset += local.length + filename.length + data.length;
}
const central = Buffer.concat(directory);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...records, central, end]);
const sha256 = createHash('sha256').update(archive).digest('hex');
await mkdir('dist', { recursive: true });
await writeFile('dist/mediaauth-image-inspector.zip', archive);
await writeFile(
  'dist/mediaauth-image-inspector.zip.sha256',
  `${sha256}  mediaauth-image-inspector.zip\n`,
);
console.log(`dist/mediaauth-image-inspector.zip: ${archive.length} bytes; SHA-256 ${sha256}`);
