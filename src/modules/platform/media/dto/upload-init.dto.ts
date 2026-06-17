import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  MEDIA_ALLOWED_MIMES,
  MEDIA_MAX_VIDEO_BYTES,
} from '../interfaces/asset.types';

/**
 * Initiate a direct-to-storage upload. The optional generic entity binding
 * (`entityType`/`entityId`/`entitySubtype`) is free-form — the platform layer
 * assigns no meaning beyond grouping, so it never references domain tables.
 */
export class UploadInitDto {
  @ApiProperty({ example: 'cover.jpg' })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({ enum: MEDIA_ALLOWED_MIMES, example: 'image/jpeg' })
  @IsString()
  @IsEnum(MEDIA_ALLOWED_MIMES)
  mimeType: string;

  @ApiProperty({ example: 1_048_576, description: 'File size in bytes' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MEDIA_MAX_VIDEO_BYTES)
  fileSize: number;

  @ApiPropertyOptional({ type: [String], example: ['hero'] })
  @IsOptional()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    example: 'product',
    description: 'Generic entity-ref type; omit for an unbound library upload',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  entityType?: string;

  @ApiPropertyOptional({ example: '42', description: 'Generic entity-ref id' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  entityId?: string;

  @ApiPropertyOptional({
    example: 'gallery:0',
    description: 'Optional slot/sub-key within the entity',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  entitySubtype?: string;
}
