import { ApiProperty } from '@nestjs/swagger';

/** List-view of a legal document — omits `content` (can be tens of KB). */
export class LegalDocumentSummaryDto {
  @ApiProperty()
  slug: string;

  @ApiProperty()
  version: string;

  @ApiProperty()
  type: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'i18n title map keyed by locale',
  })
  title: Record<string, string>;

  @ApiProperty()
  publishedAt: Date;
}
