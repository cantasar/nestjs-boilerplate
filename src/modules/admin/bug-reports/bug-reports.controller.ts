import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ProdAdminGuard } from '../../shared/common/guards/prod-admin.guard';
import { GetUser } from '../../shared/common/decorators/get-user.decorator';
import {
  ApiErrorCodes,
  ApiPaginatedEnvelope,
  ApiResourceErrors,
} from '../../shared/common/decorators/api-common-responses.decorator';
import { BugReportErrorCode } from '../../shared/common/errors/error-codes';
import { Audit } from '../../shared/common/audit/audit.decorator';
import { AuditAction } from '../../shared/common/audit/enums/audit-action.enum';
import { AuditEntity } from '../../shared/common/audit/enums/audit-entity.enum';
import { BugReportsService } from './bug-reports.service';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import { BugReportQueryDto } from './dto/bug-report-query.dto';
import { BugReportDto } from './dto/bug-report-response.dto';

/**
 * Admin-only bug-report intake + triage API. Every route is gated by
 * ProdAdminGuard (JWT + admin role). Mutations are declaratively audited via the
 * cross-cutting @Audit interceptor: it reads the prior row through
 * `loadBefore -> this.service.findById` and the post-mutation snapshot from the
 * returned row. The success envelope is applied by the global interceptor.
 */
@ApiTags('Bug Reports (Admin)')
@ApiBearerAuth()
@ApiResourceErrors()
@UseGuards(ProdAdminGuard)
@Controller({ path: 'bug-reports', version: '1' })
export class BugReportsController {
  constructor(private readonly service: BugReportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a bug report (optionally linked to a generic entity-ref).',
  })
  @ApiCreatedResponse({ type: BugReportDto })
  // CREATE has no prior state, so no loadBefore — entityId defaults to result.id.
  @Audit({ entity: AuditEntity.BUG_REPORT, action: AuditAction.CREATE })
  create(@GetUser('id') reporterId: number, @Body() dto: CreateBugReportDto) {
    return this.service.create(reporterId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List bug reports.' })
  @ApiPaginatedEnvelope(BugReportDto, { description: 'Paginated bug reports.' })
  findAll(@Query() query: BugReportQueryDto) {
    return this.service.findAll({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      severity: query.severity,
      entityType: query.entityType,
      entityId: query.entityId,
      reporterId: query.reporterId,
      assigneeId: query.assigneeId,
      includeInactive: query.includeInactive,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get a bug report by id. Soft-deleted records return 404 unless includeInactive=true.',
  })
  @ApiOkResponse({ type: BugReportDto })
  @ApiErrorCodes(BugReportErrorCode.NOT_FOUND)
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('includeInactive', new DefaultValuePipe(false), new ParseBoolPipe())
    includeInactive: boolean,
  ) {
    return this.service.findById(id, { includeInactive });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a bug report (status/severity/assignee/notes).',
  })
  @ApiOkResponse({ type: BugReportDto })
  @ApiErrorCodes(BugReportErrorCode.NOT_FOUND)
  @Audit({
    entity: AuditEntity.BUG_REPORT,
    action: AuditAction.UPDATE,
    loadBefore: (args, handlerThis) =>
      (handlerThis as BugReportsController).service.findById(
        args[0] as string,
        { includeInactive: true },
      ),
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBugReportDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Soft-delete (default) or hard-delete (force=true) a bug report. Soft-delete sets is_active=false; the record is hidden from default queries.',
  })
  @ApiNoContentResponse()
  @ApiErrorCodes(BugReportErrorCode.NOT_FOUND)
  @Audit({
    entity: AuditEntity.BUG_REPORT,
    action: AuditAction.SOFT_DELETE,
    loadBefore: (args, handlerThis) =>
      (handlerThis as BugReportsController).service.findById(
        args[0] as string,
        { includeInactive: true },
      ),
  })
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('force', new DefaultValuePipe(false), new ParseBoolPipe())
    force: boolean,
  ) {
    return this.service.delete(id, { force });
  }
}
