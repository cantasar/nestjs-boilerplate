import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TodoService } from './todo.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodoResponseDto } from './dto/todo-response.dto';
import type { Todo } from '../database/types/todo-select.type';

@ApiTags('Todos')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({ path: 'todos', version: '1' })
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Get()
  @ApiOperation({ summary: 'List todos for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'Todo list',
    type: [TodoResponseDto],
  })
  findAll(@GetUser('id') userId: number): Promise<Todo[]> {
    return this.todoService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a todo by id' })
  @ApiResponse({
    status: 200,
    description: 'Todo detail',
    type: TodoResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Todo not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ): Promise<Todo> {
    return this.todoService.findOne(id, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a todo' })
  @ApiResponse({
    status: 201,
    description: 'Todo created',
    type: TodoResponseDto,
  })
  create(
    @Body() dto: CreateTodoDto,
    @GetUser('id') userId: number,
  ): Promise<Todo> {
    return this.todoService.create(userId, dto.title);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a todo' })
  @ApiResponse({
    status: 200,
    description: 'Todo updated',
    type: TodoResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Todo not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTodoDto,
    @GetUser('id') userId: number,
  ): Promise<Todo> {
    return this.todoService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a todo' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Todo deleted' })
  @ApiResponse({ status: 404, description: 'Todo not found' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ): Promise<void> {
    await this.todoService.remove(id, userId);
  }
}
