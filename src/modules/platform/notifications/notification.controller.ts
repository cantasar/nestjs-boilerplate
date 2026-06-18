import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '../../shared/common/guards/jwt.guard';
import { GetUser } from '../../shared/common/decorators/get-user.decorator';
import { ApiPaginatedEnvelope } from '../../shared/common/decorators/api-common-responses.decorator';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { NotificationErrorCode } from '../../shared/common/errors/error-codes';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from './interfaces/notification-port.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import type { NotificationPage } from './interfaces/notification.types';

/**
 * Authenticated inbox API. Depends only on the `NOTIFICATION_PORT` abstraction,
 * so the persistence backend is swappable. List is paginated and wrapped in the
 * standard envelope by the response interceptor.
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationController {
  constructor(
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user notifications' })
  @ApiPaginatedEnvelope(NotificationResponseDto, {
    description: 'Paginated inbox, newest first',
  })
  list(
    @Query() query: ListNotificationsQueryDto,
    @GetUser('id') userId: number,
  ): Promise<NotificationPage> {
    return this.notifications.listForUser({
      recipientUserId: userId,
      page: query.page,
      limit: query.limit,
      unreadOnly: query.unreadOnly,
    });
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Count the authenticated user unread notifications',
  })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  async unreadCount(
    @GetUser('id') userId: number,
  ): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notifications.unreadCount(userId);
    return { unreadCount };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 204, description: 'Notification marked read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: number,
  ): Promise<void> {
    // void-ok
    const ok = await this.notifications.markRead(id, userId);
    if (!ok) throw new DomainException(NotificationErrorCode.NOT_FOUND);
  }
}
