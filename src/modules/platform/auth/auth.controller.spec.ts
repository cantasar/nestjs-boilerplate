import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from '../../shared/common/decorators/public.decorator';
import { AUTH_THROTTLE } from './auth.constants';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

// Metadata keys written by @Throttle() (not exported by @nestjs/throttler).
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

type Handler = keyof AuthController;

const handler = (name: Handler) =>
  AuthController.prototype[name] as (...args: unknown[]) => unknown;

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    verifyEmail: jest.fn(),
    resendEmailVerification: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    refresh: jest.fn(),
    changePassword: jest.fn(),
    logout: jest.fn(),
    googleLogin: jest.fn(),
    appleLogin: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get(AuthController);
  });

  describe('route security metadata', () => {
    const strictRoutes: Handler[] = [
      'register',
      'verifyEmail',
      'resendEmailVerification',
      'login',
      'googleLogin',
      'appleLogin',
      'forgotPassword',
      'resetPassword',
      'changePassword',
    ];

    it.each(strictRoutes)('%s has the strict 5/min auth rate limit', (name) => {
      const target = handler(name);
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, target)).toBe(
        AUTH_THROTTLE.default.limit,
      );
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, target)).toBe(
        AUTH_THROTTLE.default.ttl,
      );
    });

    it('keeps the strict limit at 5 tries per 60 seconds', () => {
      expect(AUTH_THROTTLE.default).toEqual({ limit: 5, ttl: 60_000 });
    });

    it.each([
      'register',
      'verifyEmail',
      'resendEmailVerification',
      'login',
      'googleLogin',
      'appleLogin',
      'forgotPassword',
      'resetPassword',
      'refresh',
    ] as Handler[])('%s is public', (name) => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler(name))).toBe(true);
    });

    it.each(['changePassword', 'logout'] as Handler[])(
      '%s needs a JWT (not public)',
      (name) => {
        expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler(name))).toBeFalsy();
      },
    );

    it('is not public at controller level', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController)).toBeFalsy();
    });
  });

  describe('handlers', () => {
    it('passes the register body to the service', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      authService.register.mockResolvedValue({ accessToken: 'a' });

      await expect(controller.register(dto)).resolves.toEqual({
        accessToken: 'a',
      });
      expect(authService.register).toHaveBeenCalledWith(dto);
    });

    it('passes the login body to the service', async () => {
      const dto: LoginDto = { email: 'test@example.com', password: 'pw' };
      authService.login.mockResolvedValue({ accessToken: 'a' });

      await controller.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
    });

    // L32: the service always returns a session now, so the controller passes it through as it is.
    it('passes the resend session from the service through unchanged', async () => {
      const session = {
        sessionToken: '7d0f3c1e-2a4b-4c5d-8e6f-0a1b2c3d4e5f',
        expiresIn: 900,
      };
      authService.resendEmailVerification.mockResolvedValue(session);

      await expect(
        controller.resendEmailVerification({ email: 'nobody@example.com' }),
      ).resolves.toBe(session);
      expect(authService.resendEmailVerification).toHaveBeenCalledWith(
        'nobody@example.com',
      );
    });

    it('answers forgot-password with the same message for every email', async () => {
      authService.forgotPassword.mockResolvedValue(undefined);

      const known = await controller.forgotPassword({
        email: 'user@example.com',
      });
      const unknown = await controller.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(known).toEqual(unknown);
    });

    it('changes the password of the user from the JWT, not from the body', async () => {
      authService.changePassword.mockResolvedValue(undefined);

      await controller.changePassword(42, {
        currentPassword: 'old',
        newPassword: 'new-password',
      });

      expect(authService.changePassword).toHaveBeenCalledWith(
        42,
        'old',
        'new-password',
      );
    });

    it('logs out the user from the JWT', async () => {
      authService.logout.mockResolvedValue(undefined);

      await controller.logout(42);

      expect(authService.logout).toHaveBeenCalledWith(42);
    });
  });
});
