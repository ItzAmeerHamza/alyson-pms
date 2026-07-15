import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TdAuthGuard } from '../auth/td-auth.guard';
import { ScopedAuthUser } from '../database/time-doctor-sql';
import { TimeDoctorService } from './timedoctor.service';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Time Doctor Classic (v1.1) compatible endpoints.
 * Point Alyson HR at API_BASE_URL = <host>/timedoctor/v1.1 and pass the app token
 * as ?access_token=<token> (or the x-auth-token header).
 */
@Controller('timedoctor/v1.1')
@UseGuards(TdAuthGuard)
export class TimeDoctorController {
  constructor(private readonly timeDoctor: TimeDoctorService) {}

  @Get('companies')
  companies(@Req() req: { user: ScopedAuthUser }) {
    return this.timeDoctor.listCompanies(req.user);
  }

  @Get('companies/:companyId/users')
  users(
    @Req() req: { user: ScopedAuthUser },
    @Param('companyId') companyId: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.timeDoctor.listUsers(
      req.user,
      this.parseCompanyId(companyId),
      this.parseBoundedInt(offset, 0, 0, 1_000_000),
      this.parseBoundedInt(limit, 200, 1, 1000),
    );
  }

  @Get('companies/:companyId/worklogs')
  worklogs(
    @Req() req: { user: ScopedAuthUser },
    @Param('companyId') companyId: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('user_id') userId?: string,
    @Query('breaks_only') breaksOnly?: string,
  ) {
    const { start, end } = this.parseDateRange(startDate, endDate);
    return this.timeDoctor.listWorklogs(
      req.user,
      this.parseCompanyId(companyId),
      start,
      end,
      this.parseBoundedInt(limit, 500, 1, 1000),
      this.parseBoundedInt(offset, 0, 0, 1_000_000),
      this.parseOptionalId(userId),
      breaksOnly === '1' || breaksOnly === 'true',
    );
  }

  @Get('companies/:companyId/poortime')
  poorTime(
    @Req() req: { user: ScopedAuthUser },
    @Param('companyId') companyId: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('user_id') userId?: string,
    @Query('user_offset') userOffset?: string,
    @Query('user_limit') userLimit?: string,
  ) {
    const { start, end } = this.parseDateRange(startDate, endDate);
    return this.timeDoctor.listPoorTime(
      req.user,
      this.parseCompanyId(companyId),
      start,
      end,
      this.parseOptionalId(userId),
      this.parseBoundedInt(userOffset, 0, 0, 1_000_000),
      this.parseBoundedInt(userLimit, 200, 1, 1000),
    );
  }

  @Get('companies/:companyId/webandapp')
  webAndApp(
    @Req() req: { user: ScopedAuthUser },
    @Param('companyId') companyId: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('user_id') userId?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    const { start, end } = this.parseDateRange(startDate, endDate);
    return this.timeDoctor.listWebAndApp(
      req.user,
      this.parseCompanyId(companyId),
      start,
      end,
      this.parseOptionalId(userId),
      this.parseBoundedInt(offset, 0, 0, 1_000_000),
      this.parseBoundedInt(limit, 200, 1, 1000),
    );
  }

  // ---- Top-level (no company) endpoints used by Alyson HR's dashboard/attendance ----
  // These are workspace-scoped to the authenticated user and use `start`/`end`/`userId`.

  @Get('worklogs')
  worklogsFlat(
    @Req() req: { user: ScopedAuthUser },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const range = this.parseDateRange(start, end);
    return this.timeDoctor.listWorklogsFlat(
      req.user,
      range.start,
      range.end,
      this.parseOptionalId(userId),
      this.parseBoundedInt(limit, 500, 1, 1000),
      this.parseBoundedInt(offset, 0, 0, 1_000_000),
    );
  }

  @Get('poor-time')
  poorTimeFlat(
    @Req() req: { user: ScopedAuthUser },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const range = this.parseDateRange(start, end);
    return this.timeDoctor.listPoorTimeFlat(
      req.user,
      range.start,
      range.end,
      this.parseOptionalId(userId),
      this.parseBoundedInt(limit, 500, 1, 1000),
      this.parseBoundedInt(offset, 0, 0, 1_000_000),
    );
  }

  @Get('absent-late')
  absentLate(
    @Req() req: { user: ScopedAuthUser },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const range = this.parseDateRange(start, end);
    return this.timeDoctor.listAbsentLate(
      req.user,
      range.start,
      range.end,
      this.parseOptionalId(userId),
      this.parseBoundedInt(limit, 800, 1, 5000),
      this.parseBoundedInt(offset, 0, 0, 1_000_000),
    );
  }

  @Get('companies/:companyId/screenshots')
  screenshots(
    @Req() req: { user: ScopedAuthUser },
    @Param('companyId') companyId: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('screenshots_limit') screenshotsLimit?: string,
  ) {
    const { start, end } = this.parseDateRange(startDate, endDate);
    return this.timeDoctor.listScreenshots(
      req.user,
      this.parseCompanyId(companyId),
      start,
      end,
      this.parseBoundedInt(screenshotsLimit, 2000, 1, 10000),
    );
  }

  private parseCompanyId(raw: string): number {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('Invalid company_id');
    }
    return n;
  }

  private parseOptionalId(raw?: string): number | undefined {
    if (raw === undefined || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('Invalid user_id');
    }
    return n;
  }

  private parseDateRange(
    startDate?: string,
    endDate?: string,
  ): { start: string; end: string } {
    if (!startDate || !endDate) {
      throw new BadRequestException('start_date and end_date are required (YYYY-MM-DD)');
    }
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      throw new BadRequestException('start_date and end_date must be YYYY-MM-DD');
    }
    if (startDate > endDate) {
      throw new BadRequestException('start_date must be on or before end_date');
    }
    return { start: startDate, end: endDate };
  }

  private parseBoundedInt(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      throw new BadRequestException('Invalid numeric query parameter');
    }
    return Math.max(min, Math.min(n, max));
  }
}
