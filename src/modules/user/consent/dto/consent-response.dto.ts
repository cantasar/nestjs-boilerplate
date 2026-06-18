import { ApiProperty } from '@nestjs/swagger';
import { ConsentStatus } from '../../../shared/database/schema/enums/consent-status.enum';

/** One consent-history transition returned to the authenticated user. */
export class ConsentResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  documentSlug: string;

  @ApiProperty()
  documentVersion: string;

  @ApiProperty({ enum: ConsentStatus })
  status: ConsentStatus;

  @ApiProperty()
  changedAt: Date;
}
