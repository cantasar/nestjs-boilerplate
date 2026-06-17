import { DomainException } from '../../../shared/common/errors/domain.exception';
import { StorageErrorCode } from '../../../shared/common/errors/error-codes';

/**
 * Normalize a user-supplied filename into a safe storage-key segment: strip any
 * path components, replace unsafe characters with `-`, and cap the length. Pure.
 */
export function sanitizeFilename(filename: string): string {
  const name = filename.trim();
  if (!name) throw new DomainException(StorageErrorCode.FILENAME_REQUIRED);
  const sanitized =
    name
      .split(/[\\/]/g)
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]/g, '-') ?? '';
  if (!sanitized) throw new DomainException(StorageErrorCode.FILENAME_INVALID);
  return sanitized.slice(0, 200);
}
