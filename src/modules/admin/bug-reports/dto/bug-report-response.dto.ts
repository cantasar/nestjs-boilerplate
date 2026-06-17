import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaAssetResponseDto } from '../../../platform/media/dto/media-asset-response.dto';

export class BugReportDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() severity: string;
  @ApiProperty() status: string;
  @ApiPropertyOptional({ nullable: true }) route: string | null;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  payload: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true }) environment: string | null;
  @ApiPropertyOptional({ nullable: true }) entityType: string | null;
  @ApiPropertyOptional({ nullable: true }) entityId: string | null;
  @ApiPropertyOptional({ nullable: true }) reporterId: number | null;
  @ApiPropertyOptional({ nullable: true }) assigneeId: number | null;
  @ApiPropertyOptional({ nullable: true }) resolutionNote: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional({
    type: [MediaAssetResponseDto],
    description:
      'Media assets attached to this bug report (entity-ref bug_report:id). Empty array when BUG_REPORT_ATTACHMENTS_ENABLED is not "true".',
  })
  attachments?: MediaAssetResponseDto[];
}
