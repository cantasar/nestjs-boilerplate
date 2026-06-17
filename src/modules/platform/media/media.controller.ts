import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtGuard } from '../../shared/common/guards/jwt.guard';
import { ProdAdminGuard } from '../../shared/common/guards/prod-admin.guard';
import { GetUser } from '../../shared/common/decorators/get-user.decorator';
import {
  ApiErrorCodes,
  ApiOkEnvelope,
} from '../../shared/common/decorators/api-common-responses.decorator';
import { MediaErrorCode } from '../../shared/common/errors/error-codes';
import { ASSET_PORT, type AssetPort } from './interfaces/asset-port.interface';
import type { MediaAssetView } from './interfaces/asset.types';
import { UploadInitDto } from './dto/upload-init.dto';
import { UploadInitResponseDto } from './dto/upload-init-response.dto';
import { MediaAssetResponseDto } from './dto/media-asset-response.dto';
import { ListByEntityQueryDto } from './dto/list-by-entity-query.dto';

/**
 * Authenticated media API. Depends only on the `ASSET_PORT` abstraction, so the
 * persistence/storage backend is swappable. The success envelope is applied by
 * the global response interceptor.
 */
@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(@Inject(ASSET_PORT) private readonly assets: AssetPort) {}

  @Post('upload-init')
  @ApiOperation({
    summary:
      'Issue a signed upload URL + asset id; optionally bind to a generic entity',
  })
  @ApiOkEnvelope(UploadInitResponseDto)
  @ApiErrorCodes(MediaErrorCode.FILE_SIZE_EXCEEDS_LIMIT)
  uploadInit(
    @Body() dto: UploadInitDto,
    @GetUser('id') uploaderId: number,
  ): Promise<UploadInitResponseDto> {
    return this.assets.presignUpload({
      filename: dto.filename,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      uploaderId,
      tags: dto.tags,
      entityType: dto.entityType,
      entityId: dto.entityId,
      entitySubtype: dto.entitySubtype,
    });
  }

  // Admin-only: by-entity listing takes an arbitrary (entityType, entityId)
  // pair, so without an ownership model any authenticated user could enumerate
  // another principal's assets. Gate it to admins; per-user media access must
  // go through a domain-specific, ownership-scoped endpoint.
  @Get('by-entity')
  @UseGuards(ProdAdminGuard)
  @ApiOperation({ summary: 'List assets bound to a generic entity reference' })
  @ApiOkResponse({ type: [MediaAssetResponseDto] })
  listByEntity(
    @Query() query: ListByEntityQueryDto,
  ): Promise<MediaAssetView[]> {
    return this.assets.listByEntity(query.entityType, query.entityId);
  }
}
