import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const tool = 'MediaAuth &lt;fixture&gt; &amp; café &#x1F4F7;';
const values = {
  CreatorTool: tool,
  CreateDate: '2026-10-26T12:34:56+05:30',
  ModifyDate: '2026-10-26T12:35:00+05:30',
  MetadataDate: '2026-10-26T12:36:00+05:30',
};
const namespaces =
  'xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:m="http://ns.adobe.com/xap/1.0/"';
for (const attributes of [true, false]) {
  const description = attributes
    ? `<r:Description r:about="" ${Object.entries(values)
        .map(([name, value]) => `m:${name}="${value}"`)
        .join(' ')}/>`
    : `<r:Description r:about="">${Object.entries(values)
        .map(([name, value]) => `<m:${name}>${value}</m:${name}>`)
        .join(
          '',
        )}<v:opaque xmlns:v="urn:mediaauth:fixture" r:resource="http://127.0.0.1:9/do-not-fetch"><m:CreatorTool>Nested spoof ignored</m:CreatorTool></v:opaque></r:Description>`;
  const graph = `<r:RDF ${namespaces}>${description}</r:RDF>`;
  const xml = attributes
    ? `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="MediaAuth fixture">${graph}</x:xmpmeta>\n  <?xpacket end="w"?>`
    : `<?xml version="1.0" encoding="UTF-8"?>${graph}`;
  const payload = Buffer.concat([
    Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'ascii'),
    Buffer.from(xml, 'utf8'),
  ]);
  assert.ok(payload.length <= 65533);
  const marker = Buffer.from([255, 225, 0, 0]);
  marker.writeUInt16BE(payload.length + 2, 2);
  const jpeg = await readFile(
    new URL(
      `../tests/fixtures/metadata/exif-${attributes ? 'little' : 'big'}.jpg`,
      import.meta.url,
    ),
  );
  const bytes = Buffer.concat([jpeg.subarray(0, 2), marker, payload, jpeg.subarray(2)]);
  const name = `xmp-${attributes ? 'attributes' : 'elements'}.jpg`;
  await writeFile(new URL(`../tests/fixtures/metadata/${name}`, import.meta.url), bytes);
  console.log(
    `${name}: ${bytes.length} bytes; SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
