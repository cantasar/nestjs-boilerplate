import { HttpStatus } from '@nestjs/common';
import type { ErrorCodeDefinition } from './error-code.types';

/**
 * Cross-cutting error codes owned by no single feature. The global
 * `HttpExceptionFilter` references `COMMON_VALIDATION_FAILED` / `COMMON_INTERNAL_ERROR`
 * directly when normalizing framework + unknown errors into the envelope.
 */
export enum CommonErrorCode {
  VALIDATION_FAILED = 'COMMON_VALIDATION_FAILED',
  INTERNAL_ERROR = 'COMMON_INTERNAL_ERROR',
  NOT_FOUND = 'COMMON_NOT_FOUND',
  FORBIDDEN = 'COMMON_FORBIDDEN',
  UNAUTHORIZED = 'COMMON_UNAUTHORIZED',
  CONFLICT = 'COMMON_CONFLICT',
  FORBIDDEN_ADMIN_ONLY = 'COMMON_FORBIDDEN_ADMIN_ONLY',
}

export const COMMON_ERRORS: Record<CommonErrorCode, ErrorCodeDefinition> = {
  [CommonErrorCode.VALIDATION_FAILED]: {
    code: CommonErrorCode.VALIDATION_FAILED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'Validation failed',
  },
  [CommonErrorCode.INTERNAL_ERROR]: {
    code: CommonErrorCode.INTERNAL_ERROR,
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  },
  [CommonErrorCode.NOT_FOUND]: {
    code: CommonErrorCode.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'Resource not found',
  },
  [CommonErrorCode.FORBIDDEN]: {
    code: CommonErrorCode.FORBIDDEN,
    httpStatus: HttpStatus.FORBIDDEN,
    message: 'Forbidden',
  },
  [CommonErrorCode.UNAUTHORIZED]: {
    code: CommonErrorCode.UNAUTHORIZED,
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: 'Unauthorized',
  },
  [CommonErrorCode.CONFLICT]: {
    code: CommonErrorCode.CONFLICT,
    httpStatus: HttpStatus.CONFLICT,
    message: 'Conflict',
  },
  [CommonErrorCode.FORBIDDEN_ADMIN_ONLY]: {
    code: CommonErrorCode.FORBIDDEN_ADMIN_ONLY,
    httpStatus: HttpStatus.FORBIDDEN,
    message: 'Admin access required',
  },
};

/**
 * Placeholder auth error codes. Replace / extend with your real auth catalog;
 * shipped so the registry, Swagger schema and filter wiring have realistic data.
 */
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  EMAIL_ALREADY_IN_USE = 'AUTH_EMAIL_ALREADY_IN_USE',
}

export const AUTH_ERRORS: Record<AuthErrorCode, ErrorCodeDefinition> = {
  [AuthErrorCode.INVALID_CREDENTIALS]: {
    code: AuthErrorCode.INVALID_CREDENTIALS,
    httpStatus: HttpStatus.UNAUTHORIZED,
    message: 'Invalid credentials',
  },
  [AuthErrorCode.EMAIL_ALREADY_IN_USE]: {
    code: AuthErrorCode.EMAIL_ALREADY_IN_USE,
    httpStatus: HttpStatus.CONFLICT,
    message: 'Email already in use',
  },
};

/**
 * Placeholder user error codes. Replace / extend with your real user catalog.
 */
export enum UserErrorCode {
  NOT_FOUND = 'USER_NOT_FOUND',
}

export const USER_ERRORS: Record<UserErrorCode, ErrorCodeDefinition> = {
  [UserErrorCode.NOT_FOUND]: {
    code: UserErrorCode.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'User not found',
  },
};

/**
 * Object-storage error codes (filename validation). Owned by the platform
 * storage module; lives here so the registry stays the single catalog home.
 */
export enum StorageErrorCode {
  FILENAME_REQUIRED = 'STORAGE_FILENAME_REQUIRED',
  FILENAME_INVALID = 'STORAGE_FILENAME_INVALID',
}

export const STORAGE_ERRORS: Record<StorageErrorCode, ErrorCodeDefinition> = {
  [StorageErrorCode.FILENAME_REQUIRED]: {
    code: StorageErrorCode.FILENAME_REQUIRED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'A filename is required',
  },
  [StorageErrorCode.FILENAME_INVALID]: {
    code: StorageErrorCode.FILENAME_INVALID,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'Filename is invalid',
  },
};

/**
 * Media-asset error codes. Owned by the platform media module; lives here so the
 * registry stays the single catalog home.
 */
export enum MediaErrorCode {
  FILE_SIZE_EXCEEDS_LIMIT = 'MEDIA_FILE_SIZE_EXCEEDS_LIMIT',
  ASSET_NOT_FOUND = 'MEDIA_ASSET_NOT_FOUND',
}

export const MEDIA_ERRORS: Record<MediaErrorCode, ErrorCodeDefinition> = {
  [MediaErrorCode.FILE_SIZE_EXCEEDS_LIMIT]: {
    code: MediaErrorCode.FILE_SIZE_EXCEEDS_LIMIT,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'File size {fileSize} exceeds the limit of {maxFileSize} bytes',
  },
  [MediaErrorCode.ASSET_NOT_FOUND]: {
    code: MediaErrorCode.ASSET_NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'Media asset {id} not found',
  },
};

/**
 * Legal-document error codes. Owned by the user legal-documents/consent
 * features; lives here so the registry stays the single catalog home. The
 * public `:slug` route quotes the slug in its message, so it is a distinct code
 * from the generic NOT_FOUND (kept for the future admin lookups).
 */
export enum LegalDocumentErrorCode {
  NOT_FOUND = 'LEGAL_DOCUMENT_NOT_FOUND',
  NOT_FOUND_BY_SLUG = 'LEGAL_DOCUMENT_NOT_FOUND_BY_SLUG',
}

export const LEGAL_DOCUMENTS_ERRORS: Record<
  LegalDocumentErrorCode,
  ErrorCodeDefinition
> = {
  [LegalDocumentErrorCode.NOT_FOUND]: {
    code: LegalDocumentErrorCode.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'Legal document not found',
  },
  [LegalDocumentErrorCode.NOT_FOUND_BY_SLUG]: {
    code: LegalDocumentErrorCode.NOT_FOUND_BY_SLUG,
    httpStatus: HttpStatus.NOT_FOUND,
    message: "Legal document '{slug}' not found",
  },
};

/**
 * Bug-report error codes. Owned by the admin bug-reports feature; lives here so
 * the registry stays the single catalog home.
 */
export enum BugReportErrorCode {
  NOT_FOUND = 'BUG_REPORT_NOT_FOUND',
}

export const BUG_REPORT_ERRORS: Record<
  BugReportErrorCode,
  ErrorCodeDefinition
> = {
  [BugReportErrorCode.NOT_FOUND]: {
    code: BugReportErrorCode.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'Bug report {id} not found',
  },
};

/**
 * Notification inbox error codes. Owned by the platform notifications feature;
 * lives here so the registry stays the single catalog home.
 */
export enum NotificationErrorCode {
  NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
}

export const NOTIFICATION_ERRORS: Record<
  NotificationErrorCode,
  ErrorCodeDefinition
> = {
  [NotificationErrorCode.NOT_FOUND]: {
    code: NotificationErrorCode.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'Notification not found',
  },
};
