import { Test, TestingModule } from '@nestjs/testing';
import { TodoController } from './todo.controller';
import { TodoService } from './todo.service';
import { JwtGuard } from '../common/guards/jwt.guard';

describe('TodoController', () => {
  let controller: TodoController;
  const mockTodoService = {
    findAll: jest.fn(),
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
    })
      .overrideGuard(JwtGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<TodoController>(TodoController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
