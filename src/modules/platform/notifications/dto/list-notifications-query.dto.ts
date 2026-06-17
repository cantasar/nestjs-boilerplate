import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/common/dto/pagination-query.dto';

/** Inbox list query: standard pagination plus an optional unread-only filter. */
export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Return only unread notifications.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}
