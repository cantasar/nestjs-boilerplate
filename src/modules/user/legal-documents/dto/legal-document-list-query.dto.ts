import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { DocumentType } from '../../../shared/database/schema/enums/document-type.enum';

/** Query for the public legal-documents list: optional document-type filter. */
export class LegalDocumentListQueryDto {
  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;
}
