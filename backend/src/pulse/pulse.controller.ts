import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import {
  canAccessPulseTeamReports,
  canManagePulseUsers,
  canViewPulseTeam,
  isPulseOrgAdmin,
} from '../database/time-doctor-sql';
import { CreateTimeAdjustmentDto } from './dto/time-adjustment.dto';
import { PulseService } from './pulse.service';

@Controller('pulse')
@UseGuards(AuthGuard)
export class PulseController {
  constructor(private readonly pulse: PulseService) {}

  private ensureOrgAdmin(user: { role?: string; is_super_admin?: boolean }) {
    if (!isPulseOrgAdmin(user)) {
      throw new ForbiddenException('Admin role required');
    }
  }

  private async ensureTeamReports(user: any) {
    if (canAccessPulseTeamReports(user)) return;
    if (await this.pulse.hasDelegatedAccess(user)) return;
    throw new ForbiddenException('Insufficient permissions for team reports');
  }

  private ensureCanManageUsers(user: { role?: string; is_super_admin?: boolean }) {
    if (!canManagePulseUsers(user)) {
      throw new ForbiddenException('Admin or manager role required');
    }
  }

  private ensureCanViewTeam(user: { role?: string; is_super_admin?: boolean }) {
    if (!canViewPulseTeam(user)) {
      throw new ForbiddenException('Insufficient permissions to view team');
    }
  }

  /** Dashboard snapshot: hours, active users, activity %, daily breakdown. */
  @Get('dashboard')
  async dashboard(
    @Req() req: { user: any },
    @Query('days') days?: string,
  ) {
    this.ensureOrgAdmin(req.user);
    const n = days ? Math.min(Math.max(Number(days), 1), 90) : 7;
    return this.pulse.getDashboard(req.user, n);
  }

  /** Employee × day hours grid — org-wide for admin, granted targets for delegates, else self. */
  @Get('daily-hours')
  async dailyHours(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    if (!start || !end) {
      throw new BadRequestException('start and end query params are required');
    }
    if (
      canAccessPulseTeamReports(req.user) ||
      (await this.pulse.hasDelegatedAccess(req.user))
    ) {
      return this.pulse.getDailyHours(req.user, start, end);
    }
    return this.pulse.getDailyHours(req.user, start, end, req.user.id);
  }

  /** Hours by project for the period — same visibility as daily-hours. */
  @Get('project-hours')
  async projectHours(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('userId') userId?: string,
  ) {
    if (!start || !end) {
      throw new BadRequestException('start and end query params are required');
    }
    const canSeeTeam =
      canAccessPulseTeamReports(req.user) ||
      (await this.pulse.hasDelegatedAccess(req.user));
    if (userId) {
      if (!canSeeTeam && String(userId) !== String(req.user.id)) {
        throw new ForbiddenException('Insufficient permissions for this user');
      }
      return this.pulse.getProjectHours(req.user, start, end, userId);
    }
    if (canSeeTeam) {
      return this.pulse.getProjectHours(req.user, start, end);
    }
    return this.pulse.getProjectHours(req.user, start, end, req.user.id);
  }

  /** Activity levels ranked by engagement (no AI — input events ÷ tracked time). */
  @Get('activity-levels')
  async activityLevels(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    await this.ensureTeamReports(req.user);
    if (!start || !end) {
      throw new BadRequestException('start and end query params are required');
    }
    return this.pulse.getActivityLevels(req.user, start, end);
  }

  /** Per-employee screenshot and input activity totals. */
  @Get('activity-summary')
  async activitySummary(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    await this.ensureTeamReports(req.user);
    if (!start || !end) {
      throw new BadRequestException('start and end query params are required');
    }
    return this.pulse.getActivitySummary(req.user, start, end);
  }

  /** Per-employee AI descriptions and activity classification from screenshots. */
  @Get('ai-insights')
  async aiInsights(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    await this.ensureTeamReports(req.user);
    if (!start || !end) {
      throw new BadRequestException('start and end query params are required');
    }
    return this.pulse.getAiInsights(req.user, start, end);
  }

  /** Employees with zero tracked hours on a day and/or the prior day (Daily Check-in). */
  @Get('not-tracking')
  async notTracking(
    @Req() req: { user: any },
    @Query('date') date?: string,
  ) {
    await this.ensureTeamReports(req.user);
    return this.pulse.getNotTracking(req.user, date);
  }

  /** Team directory: leads and direct reports with weekly hours. */
  @Get('team')
  async team(@Req() req: { user: any }) {
    this.ensureCanViewTeam(req.user);
    return this.pulse.getTeam(req.user);
  }

  /** Org settings (hours threshold, etc.). */
  @Get('settings')
  async settings(@Req() req: { user: any }) {
    this.ensureOrgAdmin(req.user);
    return this.pulse.getOrgSettings(req.user);
  }

  /**
   * Employees below hours / pace threshold.
   * period=pace (default): month + week_index (cumulative target through that week).
   * period=week: single Mon–Fri week. period=day: one day.
   */
  @Get('low-hours')
  async lowHours(
    @Req() req: { user: any },
    @Query('date') date?: string,
    @Query('week_start') weekStart?: string,
    @Query('month') month?: string,
    @Query('week_index') weekIndex?: string,
    @Query('period') period?: string,
    @Query('hours_threshold') hoursThreshold?: string,
    @Query('pace_percent') pacePercent?: string,
  ) {
    this.ensureOrgAdmin(req.user);
    const resolvedPeriod = (period || 'pace').toLowerCase();
    if (resolvedPeriod === 'pace') {
      if (!month && !weekStart && !date) {
        throw new BadRequestException('month (YYYY-MM) or week_start is required for pace');
      }
    } else if (resolvedPeriod === 'week') {
      if (!weekStart && !date && !(month && weekIndex)) {
        throw new BadRequestException(
          'week_start/date or month + week_index is required for week',
        );
      }
    } else if (!date && !weekStart) {
      throw new BadRequestException('week_start or date is required (YYYY-MM-DD)');
    }
    return this.pulse.getLowHours(req.user, {
      period: resolvedPeriod,
      date,
      week_start: weekStart,
      month,
      week_index: weekIndex,
      hours_threshold: hoursThreshold,
      pace_percent: pacePercent,
    });
  }

  /** Allowlisted SES From addresses for Email Reporting. */
  @Get('low-hours/senders')
  async lowHoursSenders(@Req() req: { user: any }) {
    this.ensureOrgAdmin(req.user);
    return this.pulse.getEmailSenders();
  }

  /** Send low-hours / pace notification emails. */
  @Post('low-hours/send')
  async sendLowHours(
    @Req() req: { user: any },
    @Body()
    body: {
      date?: string;
      week_start?: string;
      month?: string;
      week_index?: number;
      period?: string;
      employee_ids?: string[];
      notify_manager?: boolean;
      hours_threshold?: number;
      pace_percent?: number;
      from?: string;
    },
  ) {
    this.ensureOrgAdmin(req.user);
    const resolvedPeriod = (body?.period || 'pace').toLowerCase();
    if (resolvedPeriod === 'pace') {
      if (!body?.month && !body?.week_start && !body?.date) {
        throw new BadRequestException('month or week_start is required for pace');
      }
    } else if (resolvedPeriod === 'week') {
      if (!body?.week_start && !body?.date && !(body?.month && body?.week_index)) {
        throw new BadRequestException(
          'week_start/date or month + week_index is required for week',
        );
      }
    } else if (!body?.date && !body?.week_start) {
      throw new BadRequestException('week_start or date is required');
    }
    return this.pulse.sendLowHoursEmails(req.user, body);
  }

  /** Sent low-hours email history. */
  @Get('low-hours/history')
  async lowHoursHistory(
    @Req() req: { user: any },
    @Query('limit') limit?: string,
  ) {
    this.ensureOrgAdmin(req.user);
    return this.pulse.getLowHoursHistory(
      req.user,
      limit ? Number(limit) : 50,
    );
  }

  /** Update employee fields for Team Management (admin/manager). */
  @Patch('users/:id')
  async updateUser(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Body()
    body: {
      full_name?: string;
      role?: string;
      department?: string | null;
      location?: string | null;
      manager_id?: string | null;
      is_active?: boolean;
    },
  ) {
    this.ensureCanManageUsers(req.user);
    const updated = await this.pulse.updateUser(req.user, id, body);
    if (!updated) throw new BadRequestException('User not found or update failed');
    return updated;
  }

  /**
   * Org-admin only: list manual time adjustments for one employee × Pacific day.
   */
  @Get('time-adjustments')
  async listTimeAdjustments(
    @Req() req: { user: any },
    @Query('userId') userId: string,
    @Query('workDate') workDate: string,
  ) {
    this.ensureOrgAdmin(req.user);
    if (!userId || !workDate) {
      throw new BadRequestException('userId and workDate are required');
    }
    return this.pulse.listTimeAdjustments(req.user, userId, workDate);
  }

  /**
   * Org-admin only: add (+) or remove (-) time for an employee on a Pacific day.
   * Append-only audit row; day total = tracked + net adjustments (never below 0).
   */
  @Post('time-adjustments')
  async createTimeAdjustment(
    @Req() req: { user: any },
    @Body() body: CreateTimeAdjustmentDto,
  ) {
    this.ensureOrgAdmin(req.user);
    return this.pulse.createTimeAdjustment(req.user, body);
  }
}
