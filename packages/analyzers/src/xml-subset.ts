import { MediaAuthError } from '@media-auth/core';
import { invalidMetadata } from './metadata-reader.js';

export interface XmlNode {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: XmlNode[];
  text: string;
}
export const xmlWhitespace = (value: string) => /^[ \t\r\n]*$/.test(value);
const xmlUri = 'http://www.w3.org/XML/1998/namespace';
const xmlnsUri = 'http://www.w3.org/2000/xmlns/';
const expanded = (uri: string, name: string) => `{${uri}}${name}`;
const validChar = (point: number) =>
  point === 9 ||
  point === 10 ||
  point === 13 ||
  (point >= 32 && point <= 0xd7ff) ||
  (point >= 0xe000 && point <= 0xfffd) ||
  (point >= 0x10000 && point <= 0x10ffff);
function budget(condition: boolean, label: string) {
  if (condition) throw new MediaAuthError('RESOURCE_LIMIT', `XMP XML exceeds ${label}.`);
}
function references(value: string, attribute: boolean) {
  if (attribute && value.includes('<')) invalidMetadata('Raw markup in XMP XML attribute.');
  const normalized = attribute ? value.replace(/[\t\n]/g, ' ') : value;
  const named = new Map([
    ['amp', '&'],
    ['lt', '<'],
    ['gt', '>'],
    ['quot', '"'],
    ['apos', "'"],
  ]);
  // Bounded alternatives, single pass. Decoded ampersands are never expanded again.
  return normalized.replace(
    /&(amp|lt|gt|quot|apos|#x[0-9A-Fa-f]{1,6}|#[0-9]{1,7});|&/g,
    (_all, body: string | undefined) => {
      if (!body) invalidMetadata('Unsupported or malformed XMP XML reference.');
      const text = named.get(body);
      if (text !== undefined) return text;
      const point = Number.parseInt(
        body.slice(body.startsWith('#x') ? 2 : 1),
        body.startsWith('#x') ? 16 : 10,
      );
      if (!validChar(point)) invalidMetadata('Invalid XMP XML character reference.');
      return String.fromCodePoint(point);
    },
  );
}

/** Deliberately rejecting XML subset: no DTD, external entities, comments or CDATA. */
export function readXmlSubset(input: string, consume: () => void): XmlNode {
  budget(input.length > 65504, 'packet character limit');
  for (const char of input)
    if (!validChar(char.codePointAt(0) ?? 0)) invalidMetadata('Invalid XMP XML character.');
  const text = input.replace(/\r\n?/g, '\n');
  const names = /[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
  let pos = 0,
    nodes = 0;
  let root: XmlNode | undefined;
  let packet = false,
    packetEnded = false,
    declaration = false;
  const stack: { raw: string; node: XmlNode; namespaces: Map<string, string> }[] = [];
  function whitespace() {
    while (pos < text.length && /[ \t\n]/.test(text[pos] ?? '')) pos++;
  }
  function name() {
    names.lastIndex = pos;
    const match = names.exec(text)?.[0];
    if (!match) invalidMetadata('Unsupported XMP XML name.');
    budget(match.length > 128, 'name limit');
    pos += match.length;
    return match;
  }
  function resolve(raw: string, namespaces: ReadonlyMap<string, string>, attribute = false) {
    const colon = raw.indexOf(':');
    if (colon < 0) return expanded(attribute ? '' : (namespaces.get('') ?? ''), raw);
    const prefix = raw.slice(0, colon),
      uri = namespaces.get(prefix);
    if (!uri || prefix === 'xmlns') invalidMetadata('Unbound or reserved XMP XML prefix.');
    return expanded(uri, raw.slice(colon + 1));
  }
  while (pos < text.length) {
    consume();
    if (text[pos] !== '<') {
      const end = text.indexOf('<', pos);
      const value = text.slice(pos, end < 0 ? text.length : end);
      if (value.includes(']]>')) invalidMetadata('Unsupported XMP XML text delimiter.');
      const current = stack.at(-1);
      if (current) current.node.text += references(value, false);
      else if (!xmlWhitespace(value)) invalidMetadata('XMP XML text outside root.');
      pos = end < 0 ? text.length : end;
      continue;
    }
    if (text.startsWith('<?', pos)) {
      const end = text.indexOf('?>', pos + 2);
      if (end < 0) invalidMetadata('Unterminated XMP processing instruction.');
      const instruction = text.slice(pos, end + 2);
      budget(instruction.length > 256, 'processing instruction limit');
      if (
        !root &&
        !packet &&
        !declaration &&
        pos === 0 &&
        /^<\?xml version=(['"])1\.0\1(?: encoding=(['"])UTF-8\2)?\?>$/.test(instruction)
      )
        declaration = true;
      else if (
        !root &&
        !packet &&
        /^<\?xpacket begin=(['"])\uFEFF?\1 id=(['"])W5M0MpCehiHzreSzNTczkc9d\2\?>$/.test(
          instruction,
        )
      )
        packet = true;
      else if (
        root &&
        !stack.length &&
        packet &&
        !packetEnded &&
        /^<\?xpacket end=(['"])[rw]\1\?>$/.test(instruction)
      )
        packetEnded = true;
      else invalidMetadata('Unsupported or misplaced XMP processing instruction.');
      pos = end + 2;
      continue;
    }
    if (text.startsWith('</', pos)) {
      pos += 2;
      const raw = name();
      whitespace();
      if (text[pos++] !== '>') invalidMetadata('Malformed XMP XML end tag.');
      if (stack.pop()?.raw !== raw) invalidMetadata('Mismatched XMP XML end tag.');
      continue;
    }
    if (text.startsWith('<!', pos))
      invalidMetadata('XMP declarations, DTD, comments and CDATA are unsupported.');
    pos++;
    const raw = name();
    const attributes = new Map<string, string>();
    while (true) {
      const before = pos;
      whitespace();
      if (text[pos] === '>' || text.startsWith('/>', pos)) break;
      if (pos === before) invalidMetadata('XMP XML attributes require whitespace.');
      consume();
      budget(attributes.size >= 16, 'attributes per element limit');
      const key = name();
      whitespace();
      if (text[pos++] !== '=') invalidMetadata('Malformed XMP XML attribute.');
      whitespace();
      const quote = text[pos++];
      if (quote !== "'" && quote !== '"') invalidMetadata('Unquoted XMP XML attribute.');
      const end = text.indexOf(quote, pos);
      if (end < 0) invalidMetadata('Unterminated XMP XML attribute.');
      budget(end - pos > 2048, 'attribute value limit');
      if (attributes.has(key)) invalidMetadata('Duplicate XMP XML attribute.');
      attributes.set(key, references(text.slice(pos, end), true));
      pos = end + 1;
    }
    const namespaces = new Map(stack.at(-1)?.namespaces ?? [['xml', xmlUri]]);
    for (const [key, value] of attributes)
      if (key === 'xmlns' || key.startsWith('xmlns:')) {
        const prefix = key === 'xmlns' ? '' : key.slice(6);
        if (
          prefix === 'xmlns' ||
          value === xmlnsUri ||
          (prefix === 'xml' ? value !== xmlUri : value === xmlUri) ||
          (prefix !== '' && !value)
        )
          invalidMetadata('Invalid XMP XML namespace binding.');
        budget(value.length > 256, 'namespace URI limit');
        namespaces.set(prefix, value);
      }
    budget(namespaces.size > 32, 'namespace bindings limit');
    const resolved = new Map<string, string>();
    for (const [key, value] of attributes)
      if (key !== 'xmlns' && !key.startsWith('xmlns:')) {
        const qualified = resolve(key, namespaces, true);
        if (resolved.has(qualified)) invalidMetadata('Duplicate expanded XMP XML attribute.');
        resolved.set(qualified, value);
      }
    budget(++nodes > 128, 'node limit');
    budget(stack.length >= 8, 'depth limit');
    const node: XmlNode = {
      name: resolve(raw, namespaces),
      attributes: resolved,
      children: [],
      text: '',
    };
    const parent = stack.at(-1);
    if (parent) parent.node.children.push(node);
    else {
      if (root || packetEnded) invalidMetadata('Multiple XMP XML roots.');
      root = node;
    }
    const empty = text.startsWith('/>', pos);
    pos += empty ? 2 : 1;
    if (!empty) stack.push({ raw, node, namespaces });
  }
  if (!root || stack.length || (packet && !packetEnded))
    invalidMetadata('Incomplete XMP XML or packet wrapper.');
  return root;
}
