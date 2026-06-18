import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TodoService } from './todo.service';
import { TodoRepository } from './todo.repository';

describe('TodoService', () => {
  let service: TodoService;

  const mockRepository = {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TodoService,
        {
          provide: TodoRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<TodoService>(TodoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return todos for user', async () => {
      const inputUserId = 1;
      const expectedTodos = [
        { id: 1, title: 'Test', userId: inputUserId, completed: false },
      ];
      mockRepository.findByUserId.mockResolvedValue(expectedTodos);

      const actualResult = await service.findAll(inputUserId);

      expect(mockRepository.findByUserId).toHaveBeenCalledWith(inputUserId);
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
      mockRepository.findById.mockResolvedValue(expectedTodo);

      const actualResult = await service.findOne(1, 1);

      expect(actualResult).toEqual(expectedTodo);
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create and return todo', async () => {
      const expectedTodo = { id: 1, title: 'New', userId: 1, completed: false };
      mockRepository.create.mockResolvedValue(expectedTodo);

      const actualResult = await service.create(1, 'New');

      expect(mockRepository.create).toHaveBeenCalledWith({
        userId: 1,
        title: 'New',
      });
      expect(actualResult).toEqual(expectedTodo);
    });
  });

  describe('update', () => {
    it('should update and return todo', async () => {
      const expectedTodo = {
        id: 1,
        title: 'Updated',
        userId: 1,
        completed: true,
      };
      mockRepository.update.mockResolvedValue(expectedTodo);

      const actualResult = await service.update(1, 1, {
        title: 'Updated',
        completed: true,
      });

      expect(mockRepository.update).toHaveBeenCalledWith(1, 1, {
        title: 'Updated',
        completed: true,
      });
      expect(actualResult).toEqual(expectedTodo);
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.update.mockResolvedValue(undefined);

      await expect(
        service.update(999, 1, { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete when todo exists', async () => {
      mockRepository.findById.mockResolvedValue({ id: 1 });
      mockRepository.delete.mockResolvedValue(undefined);

      await service.remove(1, 1);

      expect(mockRepository.delete).toHaveBeenCalledWith(1, 1);
    });

    it('should throw NotFoundException when todo not found', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(service.remove(999, 1)).rejects.toThrow(NotFoundException);
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });
  });
});
