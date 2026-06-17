import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BugSeverity } from '../enums/bug-severity.enum';

export class CreateBugReportDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: BugSeverity, default: BugSeverity.MEDIUM })
  @IsOptional()
  @IsEnum(BugSeverity)
  severity?: BugSeverity;

  @ApiPropertyOptional({ example: '/api/v1/orders/submit', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  route?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Optional request payload snapshot. Sensitive keys redacted.',
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'local', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  environment?: string;

  @ApiPropertyOptional({
    example: 'order',
    maxLength: 64,
    description:
      'Optional generic entity-ref type linking the report to a domain entity (no FK).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @ApiPropertyOptional({
    example: '42',
    maxLength: 255,
    description: 'Optional generic entity-ref id (stringified).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  assigneeId?: number;
}
