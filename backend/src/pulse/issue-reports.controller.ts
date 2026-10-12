import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import {
  isPulseOrgAdmin,
  parseWorkspaceId,
  pulseTenantForbiddenMessage,
} from '../database/time-doctor-sql';
import { CreateIssueReportDto, ListIssueReportsQueryDto } from './dto/issue-report.dto';
import { IssueReportUser, IssueReportsService } from './issue-reports.service';

@Controller('pulse/issue-reports')
@UseGuards(AuthGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class IssueReportsController {
  constructor(private readonly reports: IssueReportsService) {}

  /** Signed-in desktop user sends a problem report. */
  @Post()
  async create(
    @Req() req: { user: IssueReportUser },
    @Body() body: CreateIssueReportDto,
  ) {
    return this.reports.create(req.user, body);
  }

  /** Org admins read reports sent from the desktop app. */
  @Get()
  async list(
    @Req() req: { user: IssueReportUser },
    @Query() query: ListIssueReportsQueryDto,
  ) {
    this.ensureOrgAdmin(req.user);
    const workspaceId = parseWorkspaceId(req.user.organization_id);
    if (!workspaceId) {
      throw new ForbiddenException('Admin role required');
    }
    const rows = await this.reports.list(workspaceId, query.limit ?? 50);
    return { reports: rows };
  }

  private ensureOrgAdmin(user: IssueReportUser) {
    const message = pulseTenantForbiddenMessage(user);
    if (message) {
      throw new ForbiddenException(message);
    }
    if (!isPulseOrgAdmin(user)) {
      throw new ForbiddenException('Admin role required');
    }
  }
}
