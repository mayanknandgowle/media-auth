import { MediaAuthError } from '@media-auth/core';
import { invalidMetadata, type MetadataReader } from './metadata-reader.js';

/** Header scope only; consumed completely before either metadata reader returns fields. */
export async function* jpegHeaderSegments(reader: MetadataReader, maxPayload: number) {
  const { range, consume, sizeBytes } = reader;
  const signature = await range(0, 2);
  if (signature[0] !== 255 || signature[1] !== 216)
    invalidMetadata('Input is not a JPEG SOI stream.');
  let offset = 2;
  while (true) {
    consume();
    const prefix = await range(offset, 2);
    if (prefix[0] !== 255) invalidMetadata('JPEG metadata marker is invalid.');
    offset += 2;
    let code = prefix[1];
    while (code === 255) {
      consume();
      code = (await range(offset++, 1))[0];
    }
    if (code === 0xda || code === 0xd9) return;
    if (code === 1) continue;
    if (code === undefined || code === 0 || code === 0xd8 || (code >= 0xd0 && code <= 0xd7))
      invalidMetadata('Unexpected JPEG marker before scan.');
    const size = await range(offset, 2);
    const length = (size[0] ?? 0) * 256 + (size[1] ?? 0);
    if (length < 2 || offset > sizeBytes - length)
      invalidMetadata('JPEG metadata segment extends beyond input.');
    const payload = length - 2;
    if (payload > maxPayload)
      throw new MediaAuthError('RESOURCE_LIMIT', 'JPEG metadata segment exceeds payload budget.');
    yield { marker: code, offset: offset + 2, length: payload };
    offset += length;
  }
}
