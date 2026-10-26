import { describe, expect, it } from 'vitest';
import { readXmpPacket } from './xmp-packet.js';
import { readXmlSubset } from './xml-subset.js';
import { MediaAuthError } from '@media-auth/core';

const encoder = new TextEncoder();
const prefix =
  '<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:m="http://ns.adobe.com/xap/1.0/">';
const packet = (content = '', attributes = '') =>
  `${prefix}<r:Description r:about="" ${attributes}>${content}</r:Description></r:RDF>`;
const inspect = (xml: string) => readXmpPacket(encoder.encode(xml), () => {});
describe('limited entity-safe XMP packet', () => {
  it('resolves aliases, attributes, entities and Unicode without recursive expansion or date inference', () => {
    expect(
      inspect(
        packet(
          '<m:CreatorTool>café &lt;fixture&gt; &amp;amp; &#x1F4F7;</m:CreatorTool>',
          'm:CreateDate="not a verified date"',
        ),
      ),
    ).toEqual([
      { kind: 'RECORDED', format: 'XMP', field: 'packetPresent', value: true },
      { kind: 'RECORDED', format: 'XMP', field: 'createDate', value: 'not a verified date' },
      { kind: 'RECORDED', format: 'XMP', field: 'creatorTool', value: 'café <fixture> &amp; 📷' },
    ]);
    expect(
      inspect(
        packet(
          '<m:CreatorTool xmlns:m="urn:other">Spoof</m:CreatorTool><m:Unknown><m:CreatorTool>Nested</m:CreatorTool></m:Unknown>',
        ),
      ),
    ).toHaveLength(1);
    expect(
      inspect(packet('<CreatorTool xmlns="http://ns.adobe.com/xap/1.0/">Alias</CreatorTool>')),
    ).toContainEqual({ kind: 'RECORDED', format: 'XMP', field: 'creatorTool', value: 'Alias' });
    expect(inspect(packet('<m:CreatorTool>Line\r\nend</m:CreatorTool>'))).toContainEqual({
      kind: 'RECORDED',
      format: 'XMP',
      field: 'creatorTool',
      value: 'Line\nend',
    });
  });
  it('supports empty fields and wrappers without inventing scalar values', () => {
    expect(inspect(packet('<m:CreatorTool/>'))).toHaveLength(1);
    for (const xml of [
      packet(),
      `<x:xmpmeta xmlns:x="adobe:ns:meta/">${packet()}</x:xmpmeta>`,
      `<?xml version="1.0"?>${packet()}`,
      `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>${packet()}<?xpacket end="r"?>`,
    ])
      expect(inspect(xml)).toHaveLength(1);
  });
  it.each([
    '<!DOCTYPE x [<!ENTITY bomb "x">]>',
    '<!DOCTYPE x SYSTEM "http://127.0.0.1:9/xxe">',
    '<!--comment-->',
    '<![CDATA[abc]]>',
    '<?xml-stylesheet href="http://127.0.0.1:9/x"?>',
    '<m:CreatorTool>&unknown;</m:CreatorTool>',
    '<m:CreatorTool>&#0;</m:CreatorTool>',
    '<m:CreatorTool>&#xD800;</m:CreatorTool>',
    '<m:CreatorTool>&#x110000;</m:CreatorTool>',
    '<m:CreatorTool>&broken</m:CreatorTool>',
    '<m:CreatorTool>]]></m:CreatorTool>',
    '<m:CreatorTool><r:Seq/></m:CreatorTool>',
    '<m:CreatorTool r:resource="https://example.invalid/"/>',
    '<m:CreatorTool xml:lang="en">Tool</m:CreatorTool>',
    '<m:CreatorTool>One</m:CreatorTool><m:CreatorTool>Two</m:CreatorTool>',
    '<n:HasExtendedXMP xmlns:n="http://ns.adobe.com/xmp/note/">ABC</n:HasExtendedXMP>',
    '<m:CreatorTool>Broken</m:ModifyDate>',
    '<unbound:CreatorTool/>',
    '<m:CreatorTool>\u0000</m:CreatorTool>',
  ])('rejects unsupported/malformed XML without partial fields: %s', (content) => {
    expect(() => inspect(packet('<m:CreateDate>Prior</m:CreateDate>' + content))).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' }),
    );
  });
  it('rejects ambiguous subjects, attributes, namespaces, roots and wrapper instructions', () => {
    const bad = [
      packet('<m:CreatorTool>Two</m:CreatorTool>', 'm:CreatorTool="One"'),
      packet('', 'xmlns:a="http://ns.adobe.com/xap/1.0/" a:CreatorTool="A" m:CreatorTool="B"'),
      packet().replace('r:about=""', 'r:about="https://example.invalid/other"'),
      packet().replace('<r:RDF', '<r:RDF xml:lang="en"'),
      packet().replace('xmlns:m="http://ns.adobe.com/xap/1.0/"', 'xmlns:xml="urn:wrong"'),
      packet().replace('xmlns:m="http://ns.adobe.com/xap/1.0/"', 'xmlns:m=""'),
      packet() + '<extra/>',
      packet().slice(0, -8),
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' + packet(),
      packet() + '<?xpacket end="w"?>',
      packet('', 'a="raw<markup"'),
      packet('', 'a="1"a="2"'),
      '<r:RDF xmlns:r="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/>',
    ];
    for (const xml of bad)
      expect(() => inspect(xml)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  });
  it('rejects invalid UTF-8 and every truncated XML prefix', () => {
    for (const bytes of [
      [0xff],
      [0xc0, 0xaf],
      [0xed, 0xa0, 0x80],
      [0xef, 0xbb],
      [0xff, 0xfe, 60, 0],
    ])
      expect(() => readXmpPacket(new Uint8Array(bytes), () => {})).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
    const xml = packet('<m:CreatorTool>Known</m:CreatorTool>');
    for (let n = 0; n < xml.length; n++)
      expect(() => inspect(xml.slice(0, n))).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' }),
      );
  });
  it('enforces field, packet, structure and work limits and propagates cancellation', () => {
    expect(inspect(packet('<u/>'.repeat(126)))).toHaveLength(1);
    expect(inspect(packet('<u>'.repeat(6) + '</u>'.repeat(6)))).toHaveLength(1);
    expect(
      inspect(packet('', Array.from({ length: 15 }, (_, i) => `a${i}="x"`).join(' '))),
    ).toHaveLength(1);
    const bindings = (start: number, count: number) =>
      Array.from(
        { length: count },
        (_, i) => `xmlns:p${start + i}="urn:fixture:${start + i}"`,
      ).join(' ');
    expect(() =>
      readXmlSubset(`<a ${bindings(0, 16)}><b ${bindings(16, 15)}/></a>`, () => {}),
    ).not.toThrow();
    expect(() =>
      readXmlSubset(`<a ${bindings(0, 16)}><b ${bindings(16, 16)}/></a>`, () => {}),
    ).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }));
    expect(inspect(packet(`<m:CreatorTool>${'a'.repeat(256)}</m:CreatorTool>`))).toHaveLength(2);
    const limited = [
      packet(`<m:CreatorTool>${'a'.repeat(257)}</m:CreatorTool>`),
      packet('<u>'.repeat(7) + '</u>'.repeat(7)),
      packet('<u/>'.repeat(127)),
      packet('', Array.from({ length: 16 }, (_, i) => `a${i}="x"`).join(' ')),
      packet('', 'a="' + 'x'.repeat(2049) + '"'),
      packet('<' + 'a'.repeat(129) + '/>'),
    ];
    for (const xml of limited)
      expect(() => inspect(xml)).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }));
    expect(() => readXmpPacket(new Uint8Array(65505), () => {})).toThrow(
      expect.objectContaining({ code: 'RESOURCE_LIMIT' }),
    );
    let work = 0;
    readXmpPacket(encoder.encode(packet()), () => {
      work++;
    });
    let counted = 0;
    expect(() =>
      readXmpPacket(encoder.encode(packet()), () => {
        if (++counted >= work) throw new MediaAuthError('RESOURCE_LIMIT', 'test work');
      }),
    ).toThrow(expect.objectContaining({ code: 'RESOURCE_LIMIT' }));
    expect(() =>
      readXmpPacket(encoder.encode(packet()), () => {
        throw new MediaAuthError('CANCELLED', 'test cancel');
      }),
    ).toThrow(expect.objectContaining({ code: 'CANCELLED' }));
    expect(() => readXmlSubset('<a/>', () => {})).not.toThrow();
  });
});
