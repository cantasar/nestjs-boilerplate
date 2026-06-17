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
