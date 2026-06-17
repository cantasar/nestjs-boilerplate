import { ApiProperty } from '@nestjs/swagger';

/** Detail-view of a legal document — includes the full i18n `content` map. */
export class LegalDocumentDetailDto {
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

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'i18n content map keyed by locale',
  })
  content: Record<string, string>;

  @ApiProperty()
  publishedAt: Date;
}
