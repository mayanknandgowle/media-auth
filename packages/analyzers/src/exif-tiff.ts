import { MediaAuthError } from '@media-auth/core';
import type { MetadataObservation } from './contracts.js';

export function invalidExif(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

interface Entry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly slot: number;
}
interface Directory {
  readonly start: number;
  readonly end: number;
  readonly entries: readonly Entry[];
}

/** Selected classic TIFF fields only. Never follows GPS, thumbnail, maker-note or next-IFD graphs. */
export function readExifTiff(
  bytes: Uint8Array,
  consume: () => void,
): readonly MetadataObservation[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function range(offset: number, length: number) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length - length)
      invalidExif('EXIF offset or field extends beyond its payload.');
  }
  range(0, 8);
  const order = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0);
  if (order !== 'II' && order !== 'MM') invalidExif('Unsupported EXIF byte order.');
  const little = order === 'II';
  if (view.getUint16(2, little) !== 42) invalidExif('Unsupported EXIF TIFF header.');
  const directories: Directory[] = [];
  function directory(start: number): Directory {
    if (start < 8) invalidExif('EXIF directory overlaps its TIFF header.');
    range(start, 2);
    if (directories.some((d) => start < d.end && start + 2 > d.start))
      invalidExif('EXIF directories overlap or cycle.');
    const count = view.getUint16(start, little);
    if (count > 128)
      throw new MediaAuthError('RESOURCE_LIMIT', 'EXIF directory exceeds 128 entries.');
    const end = start + 2 + count * 12 + 4;
    range(start, end - start);
    if (directories.some((d) => start < d.end && end > d.start))
      invalidExif('EXIF directories overlap or cycle.');
    const entries: Entry[] = [];
    const tags = new Set<number>();
    for (let i = 0; i < count; i++) {
      consume();
      const offset = start + 2 + i * 12;
      const tag = view.getUint16(offset, little);
      if (tags.has(tag)) invalidExif('EXIF directory has duplicate tags.');
      tags.add(tag);
      entries.push({
        tag,
        type: view.getUint16(offset + 2, little),
        count: view.getUint32(offset + 4, little),
        slot: offset + 8,
      });
    }
    const result = { start, end, entries };
    directories.push(result);
    return result;
  }
  const primary = directory(view.getUint32(4, little));
  const pointer = primary.entries.find((entry) => entry.tag === 0x8769);
  let subdirectory: Directory | undefined;
  if (pointer) {
    if (pointer.type !== 4 || pointer.count !== 1)
      invalidExif('EXIF subdirectory pointer is not one LONG.');
    subdirectory = directory(view.getUint32(pointer.slot, little));
  }
  const observations: MetadataObservation[] = [
    { kind: 'RECORDED', format: 'EXIF', field: 'blockPresent', value: true },
  ];
  function add(field: string, value: string | number) {
    observations.push({ kind: 'RECORDED', format: 'EXIF', field, value });
  }
  function ascii(entry: Entry): string {
    if (entry.type !== 2 || entry.count < 1)
      invalidExif('Supported EXIF text requires a nonempty ASCII field.');
    if (entry.count > 257)
      throw new MediaAuthError('RESOURCE_LIMIT', 'EXIF text exceeds 256 characters.');
    const offset = entry.count <= 4 ? entry.slot : view.getUint32(entry.slot, little);
    range(offset, entry.count);
    if (
      entry.count > 4 &&
      (offset < 8 || directories.some((d) => offset < d.end && offset + entry.count > d.start))
    )
      invalidExif('EXIF text overlaps a directory or TIFF header.');
    const value = bytes.subarray(offset, offset + entry.count);
    if (value[value.length - 1] !== 0) invalidExif('EXIF ASCII text is not terminated.');
    let end = value.length;
    while (end && value[end - 1] === 0) end--;
    const content = value.subarray(0, end);
    if (content.some((byte) => byte < 32 || byte > 126))
      invalidExif('EXIF text is outside the supported printable ASCII subset.');
    return String.fromCharCode(...content);
  }
  function fields(dir: Directory, names: ReadonlyMap<number, string>) {
    for (const entry of dir.entries) {
      const name = names.get(entry.tag);
      if (name) {
        const value = ascii(entry);
        if (value) add(name, value);
      }
    }
  }
  fields(
    primary,
    new Map([
      [0x010f, 'cameraMake'],
      [0x0110, 'cameraModel'],
      [0x0131, 'software'],
      [0x0132, 'dateTime'],
    ]),
  );
  const orientation = primary.entries.find((entry) => entry.tag === 0x0112);
  if (orientation) {
    if (orientation.type !== 3 || orientation.count !== 1)
      invalidExif('EXIF orientation requires one SHORT.');
    const value = view.getUint16(orientation.slot, little);
    if (value < 1 || value > 8) invalidExif('EXIF orientation is outside 1..8.');
    add('orientation', value);
  }
  if (subdirectory) {
    fields(
      subdirectory,
      new Map([
        [0x9003, 'dateTimeOriginal'],
        [0x9004, 'dateTimeDigitized'],
        [0xa433, 'lensMake'],
        [0xa434, 'lensModel'],
      ]),
    );
    for (const [tag, name] of [
      [0xa002, 'pixelXDimension'],
      [0xa003, 'pixelYDimension'],
    ] as const) {
      const entry = subdirectory.entries.find((item) => item.tag === tag);
      if (!entry) continue;
      if ((entry.type !== 3 && entry.type !== 4) || entry.count !== 1)
        invalidExif('EXIF pixel dimensions require one SHORT or LONG.');
      const value =
        entry.type === 3 ? view.getUint16(entry.slot, little) : view.getUint32(entry.slot, little);
      if (!value) invalidExif('EXIF pixel dimensions must be positive.');
      add(name, value);
    }
  }
  return observations;
}
