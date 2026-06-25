import { isTransientSigningError } from '../utils/transient-signing-error';

describe('isTransientSigningError', () => {
  it.each([
    'Invalid response body ... signBlob: Premature close',
    'read ECONNRESET',
    'connect ETIMEDOUT',
    'socket hang up',
    'write EPIPE',
    'getaddrinfo EAI_AGAIN iamcredentials.googleapis.com',
  ])('treats %s as transient (case-insensitive)', (msg) => {
    expect(isTransientSigningError(new Error(msg))).toBe(true);
    expect(isTransientSigningError(new Error(msg.toUpperCase()))).toBe(true);
  });

  it.each([
    'AccessDenied: permission iam.serviceAccounts.signBlob denied',
    'GCS_BUCKET_NAME is required for storage operations',
    'Cannot sign data without `client_email`.',
  ])('treats %s as non-transient', (msg) => {
    expect(isTransientSigningError(new Error(msg))).toBe(false);
  });

  it('handles non-Error input', () => {
    expect(isTransientSigningError('premature close')).toBe(true);
    expect(isTransientSigningError(null)).toBe(false);
    expect(isTransientSigningError(undefined)).toBe(false);
  });
});
