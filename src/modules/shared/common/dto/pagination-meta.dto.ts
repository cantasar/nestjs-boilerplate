import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: 'Current page (1-indexed).' })
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page.' })
  limit: number;

  @ApiProperty({ example: 42, description: 'Total matching rows.' })
  totalCount: number;

  @ApiProperty({ example: 3, description: 'Total number of pages.' })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNextPage: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage: boolean;
}
