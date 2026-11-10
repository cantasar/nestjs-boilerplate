import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../shared/common/decorators/public.decorator';
import { TodoController } from './todo.controller';
import { TodoService } from './todo.service';

describe('TodoController', () => {
  let controller: TodoController;
  const mockTodoService = {
    findAll: jest.fn(),
    findPage: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TodoController],
      providers: [{ provide: TodoService, useValue: mockTodoService }],
    }).compile();
    controller = module.get<TodoController>(TodoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // L5: the copy-me template relies on the global JWT guard only (no second guard, no @Public).
  it('has no own guards and no @Public, so the global JWT guard protects every route', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TodoController),
    ).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, TodoController)).toBeUndefined();
    const methods = Object.getOwnPropertyNames(TodoController.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods.length).toBeGreaterThan(0);
    for (const name of methods) {
      const handler: unknown = Reflect.get(TodoController.prototype, name);
      expect({
        name,
        guards: Reflect.getMetadata(GUARDS_METADATA, handler as object),
      }).toEqual({ name, guards: undefined });
      expect({
        name,
        isPublic: Reflect.getMetadata(IS_PUBLIC_KEY, handler as object),
      }).toEqual({ name, isPublic: undefined });
    }
  });

  describe('findPage', () => {
    it('passes the owner and the page values to the service', async () => {
      mockTodoService.findPage.mockResolvedValue({ items: [], meta: {} });

      await controller.findPage({ page: 2, limit: 5 } as never, 7);

      expect(mockTodoService.findPage).toHaveBeenCalledWith(7, 2, 5);
    });
  });

  describe('findAll', () => {
    it('should return todos for user', async () => {
      const inputUserId = 1;
      const expectedTodos = [
        { id: 1, title: 'Test', userId: inputUserId, completed: false },
      ];
      mockTodoService.findAll.mockResolvedValue(expectedTodos);

      const actualResult = await controller.findAll(inputUserId);

      expect(mockTodoService.findAll).toHaveBeenCalledWith(inputUserId);
      expect(actualResult).toEqual(expectedTodos);
    });
  });

  describe('findOne', () => {
    it('should return todo when found', async () => {
      const expectedTodo = {
        id: 1,
        title: 'Test',
        userId: 1,
        completed: false,
      };
      mockTodoService.findOne.mockResolvedValue(expectedTodo);

      const actualResult = await controller.findOne(1, 1);

      expect(mockTodoService.findOne).toHaveBeenCalledWith(1, 1);
      expect(actualResult).toEqual(expectedTodo);
    });
  });

  describe('create', () => {
    it('should create todo and return it', async () => {
      const inputDto = { title: 'New Todo' };
      const inputUserId = 1;
      const expectedTodo = {
        id: 1,
        title: inputDto.title,
        userId: inputUserId,
        completed: false,
      };
      mockTodoService.create.mockResolvedValue(expectedTodo);

      const actualResult = await controller.create(
        inputDto as never,
        inputUserId,
      );

      expect(mockTodoService.create).toHaveBeenCalledWith(
        inputUserId,
        inputDto.title,
      );
      expect(actualResult).toEqual(expectedTodo);
    });
  });
});
