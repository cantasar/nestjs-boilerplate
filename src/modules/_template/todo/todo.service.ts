import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TodoRepository } from './todo.repository';
import type { Todo } from '../../shared/database/types/todo-select.type';
import { paginate } from '../../shared/common/utils/pagination.util';
import type { Paginated } from '../../shared/common/types/paginated.type';

@Injectable()
export class TodoService {
  constructor(private readonly todoRepository: TodoRepository) {}

  async findAll(userId: number): Promise<Todo[]> {
    return this.todoRepository.findByUserId(userId);
  }

  async findPage(
    userId: number,
    page: number,
    limit: number,
  ): Promise<Paginated<Todo>> {
    const { rows, totalCount } = await this.todoRepository.findPage(
      userId,
      page,
      limit,
    );
    return paginate(rows, totalCount, page, limit);
  }

  async findOne(id: number, userId: number): Promise<Todo> {
    const todo = await this.todoRepository.findById(id, userId);
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  async create(userId: number, title: string): Promise<Todo> {
    const todo = await this.todoRepository.create({ userId, title });
    if (!todo) throw new InternalServerErrorException('Failed to create todo');
    return todo;
  }

  async update(
    id: number,
    userId: number,
    data: { title?: string; completed?: boolean },
  ): Promise<Todo> {
    const todo = await this.todoRepository.update(id, userId, data);
    if (!todo) throw new NotFoundException('Todo not found');
    return todo;
  }

  async remove(id: number, userId: number): Promise<void> {
    // void-ok
    const todo = await this.todoRepository.findById(id, userId);
    if (!todo) throw new NotFoundException('Todo not found');
    await this.todoRepository.delete(id, userId);
  }
}
