import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class MediaAssetUrlsDto {
  @ApiPropertyOptional({ nullable: true })
  original: string | null;

  @ApiPropertyOptional({ nullable: true })
  medium: string | null;

  @ApiPropertyOptional({ nullable: true })
  thumbnail: string | null;
}

export class MediaAssetResponseDto {
  @ApiProperty({ example: 42 })
  id: number;

  @ApiProperty({ example: 'product/42/uuid-cover.jpg' })
  storageKey: string;

  @ApiProperty({ example: 'cover.jpg' })
  originalFilename: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 524_288 })
  size: number;

  @ApiProperty({ example: 'product' })
  entityType: string;

  @ApiPropertyOptional({ example: '42', nullable: true })
  entityId: string | null;

  @ApiPropertyOptional({ example: 'gallery:0', nullable: true })
  entitySubtype: string | null;

  @ApiProperty({ type: [String], example: ['hero'] })
  tags: string[];

  @ApiPropertyOptional({ example: 12, nullable: true })
  uploadedBy: number | null;

  @ApiPropertyOptional({ example: '2026-05-13T10:00:00.000Z', nullable: true })
  attachedAt: Date | null;

  @ApiPropertyOptional({ example: '2026-05-13T12:00:00.000Z', nullable: true })
  processedAt: Date | null;

  @ApiProperty({ example: '2026-05-13T09:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-13T10:00:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ nullable: true, description: 'Signed read URL (~1h)' })
  previewUrl: string | null;

  @ApiProperty({
    type: MediaAssetUrlsDto,
    description: 'Signed read URLs for original + processed variants (~1h)',
  })
  urls: MediaAssetUrlsDto;
}
