import { MediaAuthError } from '@media-auth/core';
import type { MetadataObservation } from './contracts.js';
import { invalidMetadata } from './metadata-reader.js';
import { readXmlSubset, xmlWhitespace, type XmlNode } from './xml-subset.js';

const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const basic = 'http://ns.adobe.com/xap/1.0/';
const note = 'http://ns.adobe.com/xmp/note/';
const key = (uri: string, name: string) => `{${uri}}${name}`;
const fields = new Map([
  [key(basic, 'CreatorTool'), 'creatorTool'],
  [key(basic, 'CreateDate'), 'createDate'],
  [key(basic, 'ModifyDate'), 'modifyDate'],
  [key(basic, 'MetadataDate'), 'metadataDate'],
]);

/** Selected direct scalar RDF properties only; no URL resolution or reconciliation. */
export function readXmpPacket(
  bytes: Uint8Array,
  consume: () => void,
): readonly MetadataObservation[] {
  if (bytes.length > 65504)
    throw new MediaAuthError(
      'RESOURCE_LIMIT',
      'XMP packet exceeds project inspection allocation limit.',
    );
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    invalidMetadata('XMP packet is not valid UTF-8.');
  }
  const root = readXmlSubset(text, consume);
  function whitespace(node: XmlNode) {
    if (!xmlWhitespace(node.text)) invalidMetadata('Unsupported XMP RDF mixed content.');
  }
  let graph = root;
  if (root.name === key('adobe:ns:meta/', 'xmpmeta')) {
    whitespace(root);
    if ([...root.attributes.keys()].some((name) => name !== key('adobe:ns:meta/', 'xmptk')))
      invalidMetadata('Unsupported XMP meta wrapper attribute.');
    if (root.children.length !== 1) invalidMetadata('XMP meta wrapper requires one RDF graph.');
    const child = root.children[0];
    if (!child) invalidMetadata('XMP RDF graph is missing.');
    graph = child;
  }
  if (graph.name !== key(rdf, 'RDF')) invalidMetadata('Unsupported XMP RDF root.');
  if (graph.attributes.size) invalidMetadata('Unsupported XMP RDF graph attribute.');
  whitespace(graph);
  const observations: MetadataObservation[] = [
    { kind: 'RECORDED', format: 'XMP', field: 'packetPresent', value: true },
  ];
  const seen = new Set<string>();
  function add(name: string, value: string) {
    if (name === key(note, 'HasExtendedXMP'))
      invalidMetadata('Extended XMP is outside this reader scope.');
    const field = fields.get(name);
    if (!field) return;
    if (seen.has(field)) invalidMetadata('Duplicate selected XMP property is ambiguous.');
    seen.add(field);
    if (value.length > 256)
      throw new MediaAuthError('RESOURCE_LIMIT', 'XMP field exceeds 256 UTF-16 units.');
    if (value) observations.push({ kind: 'RECORDED', format: 'XMP', field, value });
  }
  for (const description of graph.children) {
    if (
      description.name !== key(rdf, 'Description') ||
      description.attributes.get(key(rdf, 'about')) !== ''
    )
      invalidMetadata('XMP requires an empty rdf:about Description.');
    whitespace(description);
    for (const [name, value] of description.attributes)
      if (name !== key(rdf, 'about')) {
        if (
          name.startsWith(`{${rdf}}`) ||
          name.startsWith('{http://www.w3.org/XML/1998/namespace}')
        )
          invalidMetadata('Unsupported XMP subject/qualifier attribute.');
        add(name, value);
      }
    for (const property of description.children) {
      if (fields.has(property.name) || property.name === key(note, 'HasExtendedXMP')) {
        if (property.children.length || property.attributes.size)
          invalidMetadata('Selected XMP scalar has unsupported qualifiers or structure.');
        add(property.name, property.text);
      }
    }
  }
  if (!graph.children.length) invalidMetadata('XMP RDF Description is missing.');
  return observations;
}
