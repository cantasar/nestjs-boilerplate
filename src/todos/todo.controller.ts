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
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TodoService } from './todo.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodoResponseDto } from './dto/todo-response.dto';

@ApiTags('Todos')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({ path: 'todos', version: '1' })
export class TodoController {
  constructor(private readonly todoService: TodoService) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Todo listesi', type: [TodoResponseDto] })
  findAll(@GetUser('id') userId: number) {
    return this.todoService.findAll(userId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Todo detayı', type: TodoResponseDto })
  @ApiResponse({ status: 404, description: 'Todo bulunamadı' })
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser('id') userId: number) {
    return this.todoService.findOne(id, userId);
  }

  @Post()
  @ApiResponse({ status: 201, description: 'Todo oluşturuldu', type: TodoResponseDto })
  create(@Body() dto: CreateTodoDto, @GetUser('id') userId: number) {
    return this.todoService.create(userId, dto.title);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, description: 'Todo güncellendi', type: TodoResponseDto })
  @ApiResponse({ status: 404, description: 'Todo bulunamadı' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTodoDto,
    @GetUser('id') userId: number,
  ) {
    return this.todoService.update(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: 'Todo silindi' })
  @ApiResponse({ status: 404, description: 'Todo bulunamadı' })
  async remove(@Param('id', ParseIntPipe) id: number, @GetUser('id') userId: number) {
    await this.todoService.remove(id, userId);
  }
}
