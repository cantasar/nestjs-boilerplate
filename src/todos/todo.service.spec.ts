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
      const userId = 1;
      const todos = [{ id: 1, title: 'Test', userId, completed: false }];
      mockRepository.findByUserId.mockResolvedValue(todos);

      const result = await service.findAll(userId);

      expect(mockRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(result).toEqual(todos);
    });
  });

  describe('findOne', () => {
    it('should return todo when found', async () => {
      const todo = { id: 1, title: 'Test', userId: 1, completed: false };
      mockRepository.findById.mockResolvedValue(todo);

      const result = await service.findOne(1, 1);

      expect(result).toEqual(todo);
    });

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findById.mockResolvedValue(undefined);

      await expect(service.findOne(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create and return todo', async () => {
      const todo = { id: 1, title: 'New', userId: 1, completed: false };
      mockRepository.create.mockResolvedValue(todo);

      const result = await service.create(1, 'New');

      expect(mockRepository.create).toHaveBeenCalledWith({ userId: 1, title: 'New' });
      expect(result).toEqual(todo);
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
