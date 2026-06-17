import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NotificationType,
  PushDeliveryStatus,
} from '../../../shared/database/schema/enums/notification-type.enum';

export class NotificationResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 42 })
  recipientUserId: number;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty({ example: 'Your report is ready' })
  title: string;

  @ApiProperty({ example: 'Tap to view the details.' })
  body: string;

  @ApiPropertyOptional({ example: 'app://reports/1', nullable: true })
  deepLink: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/icon.png',
    nullable: true,
  })
  iconUrl: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload: unknown;

  @ApiPropertyOptional({ example: 'bcast_2026_06', nullable: true })
  broadcastId: string | null;

  @ApiPropertyOptional({ enum: PushDeliveryStatus, nullable: true })
  pushDeliveryStatus: PushDeliveryStatus | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  readAt: Date | null;

  @ApiProperty({ type: Date })
  createdAt: Date;
}
