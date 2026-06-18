import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../shared/common/decorators/get-user.decorator';
import {
  ApiAuthErrors,
  ApiErrorCodes,
} from '../../shared/common/decorators/api-common-responses.decorator';
import { LegalDocumentErrorCode } from '../../shared/common/errors/error-codes';
import { ConsentService } from './consent.service';
import { RecordConsentDto } from './dto/record-consent.dto';
import { ConsentResponseDto } from './dto/consent-response.dto';
import type { UserConsentView } from './interfaces/consent.types';

/**
 * Authenticated consent flow. Covered by the global fail-closed JwtAuthGuard,
 * so every route here requires a valid JWT. Acceptance is recorded against a
 * specific document version; the latest transition per slug is the live state.
 */
@ApiTags('Consent')
@ApiBearerAuth()
@Controller('consent')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accept a legal-document version' })
  @ApiOkResponse({ type: ConsentResponseDto })
  @ApiAuthErrors()
  @ApiErrorCodes(LegalDocumentErrorCode.NOT_FOUND_BY_SLUG)
  async accept(
    @GetUser('id') userId: number,
    @Body() dto: RecordConsentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<ConsentResponseDto> {
    const row = await this.consentService.accept(
      userId,
      dto.documentSlug,
      dto.documentVersion,
      { ipAddress: ip, userAgent: userAgent ?? null },
    );
    return this.toResponse(row);
  }

  @Post('revoke')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Revoke consent for a legal-document version' })
  @ApiOkResponse({ type: ConsentResponseDto })
  @ApiAuthErrors()
  @ApiErrorCodes(LegalDocumentErrorCode.NOT_FOUND_BY_SLUG)
  async revoke(
    @GetUser('id') userId: number,
    @Body() dto: RecordConsentDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<ConsentResponseDto> {
    const row = await this.consentService.revoke(
      userId,
      dto.documentSlug,
      dto.documentVersion,
      { ipAddress: ip, userAgent: userAgent ?? null },
    );
    return this.toResponse(row);
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user consent history' })
  @ApiOkResponse({ type: [ConsentResponseDto] })
  @ApiAuthErrors()
  async list(@GetUser('id') userId: number): Promise<ConsentResponseDto[]> {
    const rows = await this.consentService.listForUser(userId);
    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(row: UserConsentView): ConsentResponseDto {
    return {
      id: row.id,
      documentSlug: row.documentSlug,
      documentVersion: row.documentVersion,
      status: row.status,
      changedAt: row.changedAt,
    };
  }
}
