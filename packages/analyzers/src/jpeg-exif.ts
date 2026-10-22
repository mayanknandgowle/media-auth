import {
  createEvidence,
  MediaAuthError,
  unavailableResult,
  validateLimits,
  type Analyzer,
  type Evidence,
} from '@media-auth/core';
import type { MetadataAdapter, MetadataReadResult } from './contracts.js';
import { invalidExif, readExifTiff } from './exif-tiff.js';

const identity = { id: 'media-auth.jpeg-exif', version: '0.1.0' };
const limitations = [
  'Selected classic TIFF fields from one EXIF APP1 block before the first JPEG scan were inspected; this is not full EXIF conformance validation.',
  'Camera, software, dates and orientation are recorded claims that can be forged; no device, editing history, timezone, provenance or authenticity is inferred.',
  'Printable ASCII text only. GPS, owner/serial data, maker notes, thumbnails, next-directory graphs, XMP/IPTC/ICC and post-scan metadata are not inspected.',
  'Dates are unnormalized recorded strings and orientation is not applied to pixels or encoded dimensions.',
];

export const jpegExifAdapter: MetadataAdapter = {
  identity,
  async read(media, context): Promise<MetadataReadResult> {
    validateLimits(context.limits);
    if (context.cancelled())
      throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
    if (media.descriptor.mimeType !== 'image/jpeg')
      return {
        status: 'UNAVAILABLE',
        reason: 'This EXIF reader supports JPEG APP1 only; other metadata has not been searched.',
      };
    const handle = media.handle;
    if (!handle || typeof handle.read !== 'function')
      return { status: 'UNAVAILABLE', reason: 'JPEG EXIF inspection requires byte-range access.' };
    if (!Number.isSafeInteger(handle.sizeBytes) || handle.sizeBytes < 0)
      return { status: 'INCONCLUSIVE', reason: 'JPEG byte size is invalid.' };
    const sizeBytes = handle.sizeBytes;
    if (sizeBytes > context.limits.maxBytes)
      throw new MediaAuthError('RESOURCE_LIMIT', 'JPEG exceeds metadata input limit.');
    const read = handle.read.bind(handle);
    let work = 0;
    function consume() {
      if (context.cancelled())
        throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
      if (++work > context.limits.maxChunks)
        throw new MediaAuthError(
          'RESOURCE_LIMIT',
          'JPEG EXIF work exceeds the marker/entry budget.',
        );
    }
    async function range(offset: number, length: number) {
      if (offset > sizeBytes - length) invalidExif('JPEG metadata headers are truncated.');
      // Calls are fixed headers or one size-checked APP1 block, never an arbitrary declared allocation.
      if (length > 65533)
        throw new MediaAuthError('RESOURCE_LIMIT', 'EXIF payload exceeds 64 KiB.');
      const bytes = new Uint8Array(length);
      const step = Math.min(4096, context.limits.maxChunkBytes);
      for (let i = 0; i < length; i += step) {
        if (context.cancelled())
          throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
        const count = Math.min(step, length - i);
        const part = await read(offset + i, count);
        if (context.cancelled())
          throw new MediaAuthError('CANCELLED', 'Metadata inspection cancelled.');
        if (part.byteLength !== count)
          invalidExif('Metadata adapter returned an incorrect byte range.');
        bytes.set(part, i);
      }
      return bytes;
    }
    try {
      const signature = await range(0, 2);
      if (signature[0] !== 255 || signature[1] !== 216)
        invalidExif('Input is not a JPEG SOI stream.');
      let offset = 2;
      let exif: { offset: number; length: number } | undefined;
      while (true) {
        consume();
        const prefix = await range(offset, 2);
        if (prefix[0] !== 255) invalidExif('JPEG metadata marker is invalid.');
        offset += 2;
        let code = prefix[1];
        while (code === 255) {
          consume();
          code = (await range(offset++, 1))[0];
        }
        if (code === 0xda || code === 0xd9) break;
        if (code === 1) continue;
        if (code === undefined || code === 0 || code === 0xd8 || (code >= 0xd0 && code <= 0xd7))
          invalidExif('Unexpected JPEG marker before scan.');
        const size = await range(offset, 2);
        const length = (size[0] ?? 0) * 256 + (size[1] ?? 0);
        if (length < 2 || offset > sizeBytes - length)
          invalidExif('JPEG metadata segment extends beyond input.');
        const payload = length - 2;
        if (payload > context.limits.maxChunkBytes)
          throw new MediaAuthError(
            'RESOURCE_LIMIT',
            'JPEG metadata segment exceeds payload budget.',
          );
        if (code === 0xe1) {
          const id = await range(offset + 2, Math.min(6, payload));
          if (String.fromCharCode(...id.subarray(0, 4)) === 'Exif') {
            if (id.length !== 6 || id[4] !== 0 || id[5] !== 0)
              invalidExif('EXIF APP1 identifier is malformed.');
            if (exif) invalidExif('Multiple EXIF APP1 blocks are ambiguous.');
            exif = { offset: offset + 8, length: payload - 6 };
          }
        }
        offset += length;
      }
      if (!exif)
        return {
          status: 'NOT_DETECTED',
          scope:
            'Recognized EXIF APP1 identifiers in JPEG headers before the first SOS/EOI marker only; later metadata and other formats were not searched.',
        };
      const observations = readExifTiff(await range(exif.offset, exif.length), consume);
      return { status: 'DETECTED', observations, limitations };
    } catch (error) {
      if (error instanceof MediaAuthError) {
        if (error.code === 'RESOURCE_LIMIT' || error.code === 'CANCELLED') throw error;
        return { status: 'INCONCLUSIVE', reason: error.message };
      }
      return {
        status: 'UNAVAILABLE',
        reason:
          'JPEG EXIF bytes could not be read; no absence or authenticity finding is established.',
      };
    }
  },
};

export const jpegExifAnalyzer: Analyzer = {
  identity,
  category: 'METADATA',
  supportedMedia: ['IMAGE'],
  capabilities: ['LOCAL', 'NEEDS_BYTES'],
  async analyze(media, context) {
    const result = await jpegExifAdapter.read(media, context);
    if (result.status === 'UNAVAILABLE') return unavailableResult(jpegExifAnalyzer, result.reason);
    const base = {
      schemaVersion: '1.0' as const,
      id: `${identity.id}:recorded`,
      source: identity,
      category: 'METADATA' as const,
      quality: {
        reliability: 'MEDIUM' as const,
        completeness: 'PARTIAL' as const,
        rationale:
          'Direct recorded metadata in a bounded subset; unvalidated fields and unverifiable claims remain.',
      },
    };
    let evidence: Evidence;
    if (result.status === 'DETECTED')
      evidence = createEvidence({
        ...base,
        status: 'DETECTED',
        confidence: { kind: 'NOT_ASSESSED' },
        explanation:
          'An EXIF block was observed; any selected fields are recorded claims and do not verify origin or authenticity.',
        details: {
          kind: 'RECORDED',
          observations: result.observations.map((item) => ({ ...item })),
        },
      });
    else if (result.status === 'NOT_DETECTED')
      evidence = createEvidence({
        ...base,
        status: 'NOT_DETECTED',
        scope: result.scope,
        explanation:
          'No recognized EXIF APP1 block was found within the pre-scan search scope. This does not establish authenticity.',
      });
    else
      evidence = createEvidence({
        ...base,
        status: 'INCONCLUSIVE',
        reason: result.reason,
        explanation: 'EXIF inspection could not produce an unambiguous supported observation.',
      });
    return {
      schemaVersion: '1.0',
      analyzer: identity,
      status: result.status,
      evidence: [evidence],
      limitations:
        result.status === 'DETECTED'
          ? result.limitations
          : [...limitations, result.status === 'NOT_DETECTED' ? result.scope : result.reason],
    };
  },
};
