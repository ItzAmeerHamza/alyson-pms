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
import { isPulseAdmin } from '../database/time-doctor-sql';
import { PulseService } from './pulse.service';

@Controller('pulse')
@UseGuards(AuthGuard)
export class PulseController {
  constructor(private readonly pulse: PulseService) {}

  private ensureAdmin(user: { role?: string; is_super_admin?: boolean }) {
    if (!isPulseAdmin(user)) {
      throw new ForbiddenException('Admin or manager role required');
    }
  }

  /** Dashboard snapshot: hours, active users, activity %, daily breakdown. */
  @Get('dashboard')
  async dashboard(
    @Req() req: { user: any },
    @Query('days') days?: string,
  ) {
    this.ensureAdmin(req.user);
    const n = days ? Math.min(Math.max(Number(days), 1), 90) : 7;
    return this.pulse.getDashboard(req.user, n);
  }

  /** Employee × day hours grid for Daily Hours page (admins) or self (employees). */
  @Get('daily-hours')
  async dailyHours(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    if (!start || !end) {
      throw new BadRequestException('start and end query params are required');
    }
    if (isPulseAdmin(req.user)) {
      return this.pulse.getDailyHours(req.user, start, end);
    }
    return this.pulse.getDailyHours(req.user, start, end, req.user.id);
  }

  /** Activity levels ranked by engagement (no AI — input events ÷ tracked time). */
  @Get('activity-levels')
  async activityLevels(
    @Req() req: { user: any },
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    this.ensureAdmin(req.user);
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
    this.ensureAdmin(req.user);
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
    this.ensureAdmin(req.user);
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
    this.ensureAdmin(req.user);
    return this.pulse.getNotTracking(req.user, date);
  }

  /** Team directory: leads and direct reports with weekly hours. */
  @Get('team')
  async team(@Req() req: { user: any }) {
    this.ensureAdmin(req.user);
    return this.pulse.getTeam(req.user);
  }

  /** Org settings (hours threshold, etc.). */
  @Get('settings')
  async settings(@Req() req: { user: any }) {
    this.ensureAdmin(req.user);
    return this.pulse.getOrgSettings(req.user);
  }

  /** Employees below hours threshold for a given date. */
  @Get('low-hours')
  async lowHours(
    @Req() req: { user: any },
    @Query('date') date: string,
  ) {
    this.ensureAdmin(req.user);
    if (!date) throw new BadRequestException('date query param is required (YYYY-MM-DD)');
    return this.pulse.getLowHours(req.user, date);
  }

  /** Send low-hours notification emails. */
  @Post('low-hours/send')
  async sendLowHours(
    @Req() req: { user: any },
    @Body()
    body: {
      date: string;
      employee_ids?: string[];
      notify_manager?: boolean;
    },
  ) {
    this.ensureAdmin(req.user);
    if (!body?.date) throw new BadRequestException('date is required');
    return this.pulse.sendLowHoursEmails(req.user, body);
  }

  /** Sent low-hours email history. */
  @Get('low-hours/history')
  async lowHoursHistory(
    @Req() req: { user: any },
    @Query('limit') limit?: string,
  ) {
    this.ensureAdmin(req.user);
    return this.pulse.getLowHoursHistory(
      req.user,
      limit ? Number(limit) : 50,
    );
  }

  /** Update employee fields for Team Management. */
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
    this.ensureAdmin(req.user);
    const updated = await this.pulse.updateUser(req.user, id, body);
    if (!updated) throw new BadRequestException('User not found or update failed');
    return updated;
  }
}
