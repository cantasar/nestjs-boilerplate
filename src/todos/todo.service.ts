import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TodoRepository } from './todo.repository';
import type { Todo } from '../database/types/todo-select.type';

/**
 * Todo CRUD operations scoped to authenticated user.
 */
@Injectable()
export class TodoService {
  constructor(private readonly todoRepository: TodoRepository) {}

  /**
   * Lists all todos for the user.
   * @param userId - Authenticated user id
   * @returns Todo list
   */
  async findAll(userId: number): Promise<Todo[]> {
    return this.todoRepository.findByUserId(userId);
  }

  /**
   * Gets a single todo by id.
   * @param id - Todo id
   * @param userId - Authenticated user id
   * @returns Todo or throws NotFoundException
   */
  async findOne(id: number, userId: number): Promise<Todo> {
    const todo = await this.todoRepository.findById(id, userId);
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  /**
   * Creates a new todo.
   * @param userId - Authenticated user id
   * @param title - Todo title
   * @returns Created todo
   */
  async create(userId: number, title: string): Promise<Todo> {
    const todo = await this.todoRepository.create({ userId, title });
    if (!todo) throw new InternalServerErrorException('Failed to create todo');
    return todo;
  }

  /**
   * Updates a todo.
   * @param id - Todo id
   * @param userId - Authenticated user id
   * @param data - Partial update data
   * @returns Updated todo
   */
  async update(
    id: number,
    userId: number,
    data: { title?: string; completed?: boolean },
  ): Promise<Todo> {
    const todo = await this.todoRepository.update(id, userId, data);
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  /**
   * Deletes a todo.
   * @param id - Todo id
   * @param userId - Authenticated user id
   */
  async remove(id: number, userId: number): Promise<void> {
    const todo = await this.todoRepository.findById(id, userId);
    if (!todo) throw new NotFoundException('Todo not found');
    await this.todoRepository.delete(id, userId);
  }
}
