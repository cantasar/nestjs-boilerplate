import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../shared/common/errors/domain.exception';
import { BugReportErrorCode } from '../../shared/common/errors/error-codes';
import { BugReportsRepository } from './bug-reports.repository';
import type {
  BugReportListFilters,
  BugReportWithAttachments,
} from './interfaces/bug-reports.interface';
import {
  ASSET_PORT,
  type AssetPort,
} from '../../platform/media/interfaces/asset-port.interface';
import { CreateBugReportDto } from './dto/create-bug-report.dto';
import { UpdateBugReportDto } from './dto/update-bug-report.dto';
import type { BugReport, NewBugReport } from '../../shared/database/types';
import { paginate } from '../../shared/common/utils/pagination.util';
import type { Paginated } from '../../shared/common/types/paginated.type';

const BUG_REPORT_ENTITY_TYPE = 'bug_report';

@Injectable()
export class BugReportsService {
  constructor(
    private readonly repo: BugReportsRepository,
    @Inject(ASSET_PORT) private readonly assets: AssetPort,
    private readonly configService: ConfigService,
  ) {}

  async create(
    reporterId: number,
    dto: CreateBugReportDto,
  ): Promise<BugReport> {
    const insertData: NewBugReport = {
      title: dto.title,
      description: dto.description,
      severity: dto.severity ?? 'medium',
      route: dto.route ?? null,
      payload: dto.payload ?? null,
      environment: dto.environment ?? null,
      entityType: dto.entityType ?? null,
      entityId: dto.entityId ?? null,
      reporterId,
      assigneeId: dto.assigneeId ?? null,
    };

    return this.repo.create(insertData);
  }

  async findAll(filters: BugReportListFilters): Promise<Paginated<BugReport>> {
    const { data, total } = await this.repo.findAll(filters);
    return paginate(data, total, filters.page, filters.limit);
  }

  async findById(
    id: string,
    options?: { includeInactive?: boolean },
  ): Promise<BugReportWithAttachments> {
    const row = await this.repo.findById(id, options);
    if (!row)
      throw new DomainException(BugReportErrorCode.NOT_FOUND, {
        params: { id },
      });
    const attachments = this.attachmentsEnabled()
      ? await this.assets.listByEntity(BUG_REPORT_ENTITY_TYPE, id)
      : [];
    return { ...row, attachments };
  }

  async update(id: string, dto: UpdateBugReportDto): Promise<BugReport> {
    const existing = await this.repo.findById(id);
    if (!existing)
      throw new DomainException(BugReportErrorCode.NOT_FOUND, {
        params: { id },
      });

    const patch: Partial<NewBugReport> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.severity !== undefined) patch.severity = dto.severity;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.assigneeId !== undefined) patch.assigneeId = dto.assigneeId;
    if (dto.resolutionNote !== undefined)
      patch.resolutionNote = dto.resolutionNote;

    if (Object.keys(patch).length === 0) {
      return existing;
    }

    const updated = await this.repo.update(id, patch);
    if (!updated)
      throw new DomainException(BugReportErrorCode.NOT_FOUND, {
        params: { id },
      });

    return updated;
  }

  async delete(id: string, options?: { force?: boolean }): Promise<BugReport> {
    const existing = await this.repo.findById(id, { includeInactive: true });
    if (!existing)
      throw new DomainException(BugReportErrorCode.NOT_FOUND, {
        params: { id },
      });

    if (options?.force === true) {
      await this.repo.delete(id);
    } else if (existing.isActive) {
      await this.repo.softDelete(id);
    }

    return existing;
  }

  private attachmentsEnabled(): boolean {
    return (
      this.configService.get<string>('BUG_REPORT_ATTACHMENTS_ENABLED') ===
      'true'
    );
  }
}
