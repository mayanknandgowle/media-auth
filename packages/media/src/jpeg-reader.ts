import { MediaAuthError, type MediaHandle, type ResourceLimits } from '@media-auth/core';

export function invalidJpeg(message: string): never {
  throw new MediaAuthError('INVALID_INPUT', message);
}

/** Forward-only buffered reads: no allocation proportional to an untrusted segment length. */
export class JpegReader {
  offset = 0;
  private buffer = new Uint8Array(0);
  private start = 0;

  constructor(
    private readonly handle: MediaHandle,
    private readonly limits: ResourceLimits,
  ) {}

  private async fill(): Promise<void> {
    if (this.offset >= this.handle.sizeBytes) invalidJpeg('JPEG data is truncated.');
    if (this.offset < this.start + this.buffer.length) return;
    if (typeof this.handle.read !== 'function')
      throw new MediaAuthError('UNSUPPORTED_MEDIA', 'The JPEG probe requires byte-range access.');
    const length = Math.min(
      64 * 1024,
      this.limits.maxChunkBytes,
      this.handle.sizeBytes - this.offset,
    );
    const bytes = await this.handle.read(this.offset, length);
    if (bytes.byteLength !== length) invalidJpeg('Media adapter returned an incorrect byte range.');
    this.start = this.offset;
    this.buffer = new Uint8Array(bytes);
  }

  async take(length: number): Promise<Uint8Array> {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      await this.fill();
      const byte = this.buffer[this.offset++ - this.start];
      if (byte === undefined) invalidJpeg('JPEG data is truncated.');
      bytes[i] = byte;
    }
    return bytes;
  }

  skip(length: number): void {
    if (length > this.handle.sizeBytes - this.offset) invalidJpeg('JPEG segment is truncated.');
    this.offset += length;
  }

  async marker(entropy: boolean): Promise<number> {
    let prefix = 0;
    let data = false;
    let bytes = 0;
    while (true) {
      await this.fill();
      while (this.offset < this.start + this.buffer.length) {
        const byte = this.buffer[this.offset++ - this.start];
        if (byte === undefined) invalidJpeg('JPEG data is truncated.');
        bytes++;
        if (byte === 0xff) prefix++;
        else if (prefix > 0 && byte !== 0) {
          if (entropy && !data) invalidJpeg('JPEG scan contains no entropy data.');
          return byte;
        } else {
          if (!entropy || (byte === 0 && prefix > 1))
            invalidJpeg('Invalid JPEG marker or stuffing.');
          data = true;
          prefix = 0;
        }
        // Stuffed bytes count as data; marker prefixes/fill are bounded by total input size.
        if (entropy && bytes - prefix > this.limits.maxChunkBytes)
          throw new MediaAuthError(
            'RESOURCE_LIMIT',
            'JPEG entropy interval exceeds the byte limit.',
          );
      }
    }
  }
}
