import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { HttpExceptionFilter } from './http-exception.filter';
import { DomainException } from '../errors/domain.exception';
import { CommonErrorCode } from '../errors/enums/common-error-code.enum';
import { AuthErrorCode } from '../errors/enums/auth-error-code.enum';
import { UserErrorCode } from '../errors/enums/user-error-code.enum';
import {
  ALL_ERROR_CODES,
  ERROR_REGISTRY,
  resolveErrorDefinition,
} from '../errors/error-registry';
import { COMMON_ERRORS } from '../errors/error-codes';

interface Captured {
  status?: number;
  body?: {
    success: boolean;
    error: { code: string; message: string; details?: string[] };
  };
}

function run(exception: unknown): Required<Captured> {
  const captured: Captured = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Captured['body']) {
      captured.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/test' }),
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  if (captured.status === undefined || captured.body === undefined) {
    throw new Error('The filter wrote no response');
  }
  return captured as Required<Captured>;
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('maps a PayloadTooLargeException to 413 COMMON_PAYLOAD_TOO_LARGE', () => {
    const { status, body } = run(new PayloadTooLargeException());
    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body).toEqual({
      success: false,
      error: {
        code: CommonErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request body is too large',
      },
    });
  });

  it('maps an UnprocessableEntityException to 422 COMMON_BUSINESS_RULE_VIOLATION', () => {
    const { status, body } = run(new UnprocessableEntityException('nope'));
    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error.code).toBe(CommonErrorCode.BUSINESS_RULE_VIOLATION);
  });

  it('sends a BUSINESS_RULE_VIOLATION domain error as 422', () => {
    const { status, body } = run(
      new DomainException(CommonErrorCode.BUSINESS_RULE_VIOLATION),
    );
    expect(status).toBe(422);
    expect(body.error).toEqual({
      code: CommonErrorCode.BUSINESS_RULE_VIOLATION,
      message: 'Business rule violation',
    });
  });

  it('sends a PAYLOAD_TOO_LARGE domain error as 413', () => {
    const { status, body } = run(
      new DomainException(CommonErrorCode.PAYLOAD_TOO_LARGE),
    );
    expect(status).toBe(413);
    expect(body.error.code).toBe(CommonErrorCode.PAYLOAD_TOO_LARGE);
  });

  it('maps the throttler 429 to COMMON_RATE_LIMITED, not a 500', () => {
    const { status, body } = run(new ThrottlerException());
    expect(status).toBe(429);
    expect(body.error.code).toBe(CommonErrorCode.RATE_LIMITED);
  });

  it.each([
    [new UnauthorizedException('secret detail'), 401, 'COMMON_UNAUTHORIZED'],
    [new ForbiddenException(), 403, 'COMMON_FORBIDDEN'],
    [new NotFoundException('Cannot GET /x'), 404, 'COMMON_NOT_FOUND'],
  ])('maps %p to %i %s with the generic message', (error, status, code) => {
    const result = run(error);
    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
    expect(result.body.error.message).toBe(
      resolveErrorDefinition(code).message,
    );
  });

  it('keeps the ValidationPipe messages as details', () => {
    const { status, body } = run(
      new BadRequestException(['email must be an email', 'password too short']),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe(CommonErrorCode.VALIDATION_FAILED);
    expect(body.error.details).toEqual([
      'email must be an email',
      'password too short',
    ]);
  });

  it('turns an unknown error into a 500 without leaking its message', () => {
    const { status, body } = run(new Error('password=hunter2 at db.ts:12'));
    expect(status).toBe(500);
    expect(body).toEqual({
      success: false,
      error: {
        code: CommonErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      },
    });
  });

  it('turns a thrown non-error value into a 500', () => {
    const { status, body } = run('boom');
    expect(status).toBe(500);
    expect(body.error.code).toBe(CommonErrorCode.INTERNAL_ERROR);
  });

  it('keeps domain error codes, params and details', () => {
    const { status, body } = run(
      new DomainException(UserErrorCode.NOT_FOUND, {
        details: ['id=5'],
      }),
    );
    expect(status).toBe(404);
    expect(body.error).toEqual({
      code: UserErrorCode.NOT_FOUND,
      message: 'User not found',
      details: ['id=5'],
    });
  });

  // L3: other 4xx statuses are the caller's mistake, so they get COMMON_BAD_REQUEST and keep their status.
  it.each([
    [HttpStatus.METHOD_NOT_ALLOWED],
    [HttpStatus.NOT_ACCEPTABLE],
    [HttpStatus.UNSUPPORTED_MEDIA_TYPE],
    [HttpStatus.I_AM_A_TEAPOT],
    [HttpStatus.GONE],
  ])('maps a plain %i HttpException to COMMON_BAD_REQUEST', (status) => {
    const result = run(new HttpException('raw detail', status));
    expect(result.status).toBe(status);
    expect(result.body.error).toEqual({
      code: CommonErrorCode.BAD_REQUEST,
      message: 'Bad request',
    });
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it.each([
    [HttpStatus.NOT_IMPLEMENTED],
    [HttpStatus.BAD_GATEWAY],
    [HttpStatus.SERVICE_UNAVAILABLE],
  ])(
    'keeps a %i as COMMON_INTERNAL_ERROR and logs it as an error',
    (status) => {
      const result = run(new HttpException('upstream detail', status));
      expect(result.status).toBe(status);
      expect(result.body.error.code).toBe(CommonErrorCode.INTERNAL_ERROR);
      expect(result.body.error.message).toBe('Internal server error');
      expect(Logger.prototype.error).toHaveBeenCalled();
    },
  );

  // L2: auth uses its own stable codes. L45: the auth 400s too, so they never read "Validation failed".
  it.each([
    [AuthErrorCode.INVALID_CREDENTIALS, 401, 'Invalid credentials'],
    [AuthErrorCode.EMAIL_ALREADY_IN_USE, 409, 'Email already in use'],
    [CommonErrorCode.RATE_LIMITED, 429, 'Too many requests'],
    [AuthErrorCode.INVALID_CODE, 400, 'Invalid or expired code'],
    [AuthErrorCode.WRONG_PASSWORD, 400, 'Current password is incorrect'],
    [
      AuthErrorCode.SOCIAL_ACCOUNT,
      400,
      'This account signs in with Google or Apple and has no password',
    ],
    [
      AuthErrorCode.PROVIDER_DISABLED,
      400,
      'This sign-in method is not turned on',
    ],
  ])('sends %s as %i with its own message', (code, status, message) => {
    const result = run(new DomainException(code));
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ success: false, error: { code, message } });
  });

  it('logs 4xx as a warning and 5xx as an error', () => {
    run(new NotFoundException());
    expect(Logger.prototype.warn).toHaveBeenCalled();
    expect(Logger.prototype.error).not.toHaveBeenCalled();

    run(new Error('db down'));
    expect(Logger.prototype.error).toHaveBeenCalled();
  });
});

describe('error registry', () => {
  it('uses 422 for business rules and 413 for big bodies', () => {
    expect(ERROR_REGISTRY[CommonErrorCode.BUSINESS_RULE_VIOLATION]).toEqual(
      expect.objectContaining({ httpStatus: 422 }),
    );
    expect(ERROR_REGISTRY[CommonErrorCode.PAYLOAD_TOO_LARGE]).toEqual(
      expect.objectContaining({ httpStatus: 413 }),
    );
  });

  it('has a definition for every enum value, under its own code', () => {
    const enumCodes = [
      ...Object.values(CommonErrorCode),
      ...Object.values(AuthErrorCode),
      ...Object.values(UserErrorCode),
    ];
    expect([...ALL_ERROR_CODES].sort()).toEqual([...enumCodes].sort());
    for (const code of enumCodes) {
      expect(ERROR_REGISTRY[code]?.code).toBe(code);
    }
  });

  it('falls back to the internal error for an unknown code', () => {
    expect(resolveErrorDefinition('NOPE')).toBe(
      COMMON_ERRORS[CommonErrorCode.INTERNAL_ERROR],
    );
    const exception = new DomainException('NOPE');
    expect(exception.getStatus()).toBe(500);
  });
});
