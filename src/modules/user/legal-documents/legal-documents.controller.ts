import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../shared/common/decorators/public.decorator';
import {
  ApiErrorCodes,
  ApiPublicErrors,
} from '../../shared/common/decorators/api-common-responses.decorator';
import { LegalDocumentErrorCode } from '../../shared/common/errors/error-codes';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { DocumentType } from '../../shared/database/schema/enums/document-type.enum';
import {
  DOCUMENT_STORE,
  type DocumentStore,
} from '../consent/interfaces/document-store.interface';
import { LegalDocumentSummaryDto } from './dto/legal-document-summary.dto';
import { LegalDocumentDetailDto } from './dto/legal-document-detail.dto';
import { LegalDocumentListQueryDto } from './dto/legal-document-list-query.dto';

/**
 * Public, unauthenticated read API for the current legal documents. Marked
 * `@Public()` so the global fail-closed JwtAuthGuard lets pre-registration
 * users through; the global ThrottlerGuard still rate-limits these routes. List
 * omits `content` (fetched per-slug only when a user opens the document).
 */
@ApiTags('Legal Documents')
@Public()
@Controller('legal-documents')
export class LegalDocumentsController {
  constructor(@Inject(DOCUMENT_STORE) private readonly store: DocumentStore) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiQuery({ name: 'type', required: false, enum: DocumentType })
  @ApiOkResponse({ type: [LegalDocumentSummaryDto] })
  @ApiPublicErrors()
  async list(
    @Query() query: LegalDocumentListQueryDto,
  ): Promise<LegalDocumentSummaryDto[]> {
    const docs = await this.store.findCurrent(query.type);
    return docs.map((d) => ({
      slug: d.slug,
      version: d.version,
      type: d.type,
      title: d.title,
      publishedAt: d.publishedAt,
    }));
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOkResponse({ type: LegalDocumentDetailDto })
  @ApiPublicErrors()
  @ApiErrorCodes(LegalDocumentErrorCode.NOT_FOUND_BY_SLUG)
  async findOne(@Param('slug') slug: string): Promise<LegalDocumentDetailDto> {
    const doc = await this.store.findBySlug(slug);
    if (!doc) {
      throw new DomainException(LegalDocumentErrorCode.NOT_FOUND_BY_SLUG, {
        params: { slug },
      });
    }
    return {
      slug: doc.slug,
      version: doc.version,
      type: doc.type,
      title: doc.title,
      content: doc.content,
      publishedAt: doc.publishedAt,
    };
  }
}
