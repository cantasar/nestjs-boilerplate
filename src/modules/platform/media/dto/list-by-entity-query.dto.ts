import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Generic entity reference whose bound assets should be listed. */
export class ListByEntityQueryDto {
  @ApiProperty({ example: 'product', description: 'Generic entity-ref type' })
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @ApiProperty({ example: '42', description: 'Generic entity-ref id' })
  @IsString()
  @IsNotEmpty()
  entityId: string;
}
