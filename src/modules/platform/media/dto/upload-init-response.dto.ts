import { ApiProperty } from '@nestjs/swagger';

export class UploadInitResponseDto {
  @ApiProperty({ example: 42 })
  assetId: number;

  @ApiProperty({ example: 'library/12/uuid-cover.jpg' })
  storageKey: string;

  @ApiProperty({
    example: 'https://storage.example.com/...?X-...',
    description: 'Signed PUT URL — upload the bytes here',
  })
  uploadUrl: string;

  @ApiProperty({
    example: 'https://storage.example.com/.../cover.jpg?...',
    description: 'Signed GET URL (~1h) to preview right after upload',
  })
  previewUrl: string;

  @ApiProperty({ example: 900, description: 'Upload URL TTL in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'public, max-age=31536000, immutable' })
  cacheControl: string;

  @ApiProperty({ example: 10_485_760 })
  maxFileSize: number;
}
