import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Records a consent transition (accept/revoke) for one document. The status is
 * fixed by the route (`/accept` vs `/revoke`), so the body only identifies the
 * document version the user acted on.
 */
export class RecordConsentDto {
  @ApiProperty({ example: 'privacy-policy', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  documentSlug: string;

  @ApiProperty({ example: '2024-01', maxLength: 32 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  documentVersion: string;
}
