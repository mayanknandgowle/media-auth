import { MediaAuthError, validateLimits, type ResourceLimits } from '@media-auth/core';

export function validateSize(size: number, limits: ResourceLimits): void {
  validateLimits(limits);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new MediaAuthError('INVALID_INPUT', 'Media size must be a nonnegative safe integer.');
  }
  if (size > limits.maxBytes) {
    throw new MediaAuthError('RESOURCE_LIMIT', 'Media exceeds the byte limit.');
  }
}
