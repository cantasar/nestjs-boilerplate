import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    refresh: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();
    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call authService.register with dto', async () => {
      const inputDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const expectedResponse = {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 1, email: inputDto.email },
      };
      mockAuthService.register.mockResolvedValue(expectedResponse);

      const actualResult = await controller.register(inputDto as never);

      expect(mockAuthService.register).toHaveBeenCalledWith(inputDto);
      expect(actualResult).toEqual(expectedResponse);
    });
  });

  describe('login', () => {
    it('should call authService.login with dto', async () => {
      const inputDto = {
        email: 'test@example.com',
        password: 'password123',
      };
      const expectedResponse = {
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 1, email: inputDto.email },
      };
      mockAuthService.login.mockResolvedValue(expectedResponse);

      const actualResult = await controller.login(inputDto as never);

      expect(mockAuthService.login).toHaveBeenCalledWith(inputDto);
      expect(actualResult).toEqual(expectedResponse);
    });
  });
});
