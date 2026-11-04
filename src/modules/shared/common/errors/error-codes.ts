import { HttpStatus } from '@nestjs/common';
import type { ErrorCodeDefinition } from './error-code.types';
import { AuthErrorCode } from './enums/auth-error-code.enum';
import { CommonErrorCode } from './enums/common-error-code.enum';
import { UserErrorCode } from './enums/user-error-code.enum';

export const COMMON_ERRORS: Record<CommonErrorCode, ErrorCodeDefinition> = {
  [CommonErrorCode.VALIDATION_FAILED]: {
    code: CommonErrorCode.VALIDATION_FAILED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'Validation failed',
  },
  // Other 4xx errors, like 405 or 415. The HTTP status stays as it was.
  [CommonErrorCode.BAD_REQUEST]: {
    code: CommonErrorCode.BAD_REQUEST,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'Bad request',
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
  [CommonErrorCode.BUSINESS_RULE_VIOLATION]: {
    code: CommonErrorCode.BUSINESS_RULE_VIOLATION,
    httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Business rule violation',
  },
  [CommonErrorCode.RATE_LIMITED]: {
    code: CommonErrorCode.RATE_LIMITED,
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Too many requests',
  },
  [CommonErrorCode.PAYLOAD_TOO_LARGE]: {
    code: CommonErrorCode.PAYLOAD_TOO_LARGE,
    httpStatus: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'Request body is too large',
  },
  [CommonErrorCode.INVALID_STATE_TRANSITION]: {
    code: CommonErrorCode.INVALID_STATE_TRANSITION,
    httpStatus: HttpStatus.CONFLICT,
    message: 'Invalid state transition',
  },
};

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
  // One code for a wrong, expired or used code or session, so the answer never shows which one.
  [AuthErrorCode.INVALID_CODE]: {
    code: AuthErrorCode.INVALID_CODE,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'Invalid or expired code',
  },
  [AuthErrorCode.WRONG_PASSWORD]: {
    code: AuthErrorCode.WRONG_PASSWORD,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'Current password is incorrect',
  },
  [AuthErrorCode.SOCIAL_ACCOUNT]: {
    code: AuthErrorCode.SOCIAL_ACCOUNT,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'This account signs in with Google or Apple and has no password',
  },
  [AuthErrorCode.PROVIDER_DISABLED]: {
    code: AuthErrorCode.PROVIDER_DISABLED,
    httpStatus: HttpStatus.BAD_REQUEST,
    message: 'This sign-in method is not turned on',
  },
};

export const USER_ERRORS: Record<UserErrorCode, ErrorCodeDefinition> = {
  [UserErrorCode.NOT_FOUND]: {
    code: UserErrorCode.NOT_FOUND,
    httpStatus: HttpStatus.NOT_FOUND,
    message: 'User not found',
  },
};
