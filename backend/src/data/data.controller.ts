import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { canManagePulseUsers, isPulseAdmin } from '../database/time-doctor-sql';
import {
  DataService,
  normalizeScreenshotProductivityFilter,
  normalizeScreenshotSort,
} from './data.service';

@Controller('data')
@UseGuards(AuthGuard)
export class DataController {
  constructor(private readonly dataService: DataService) {}

  private ensureAdmin(user: any) {
    if (!isPulseAdmin(user)) {
      throw new ForbiddenException('Admin role required');
    }
  }

  private ensureCanManageUsers(user: any) {
    if (!canManagePulseUsers(user)) {
      throw new ForbiddenException('Admin or manager role required');
    }
  }

  @Get('users')
  async users(@Req() req: { user: any }) {
    const rows = await this.dataService.listUsers(req.user);
    const versions = await this.dataService.latestAgentVersions(
      req.user,
      rows.map((u: any) => u.id),
    );
    const byUserId = new Map<string, string>();
    for (const v of versions as any[]) {
      if (v.user_id && v.agent_version) byUserId.set(v.user_id, v.agent_version);
    }
    return rows.map((row: any) => ({
      ...row,
      auth_status: 'confirmed',
      email_confirmed_at: new Date().toISOString(),
      agent_version: byUserId.get(row.id) || null,
    }));
  }

  /** Users visible in the screenshots gallery for the current role (self, team, or org). */
  @Get('screenshot-users')
  async screenshotUsers(@Req() req: { user: any }) {
    return this.dataService.listScreenshotUsers(req.user);
  }

  @Get('projects')
  async projects(@Req() req: { user: any }) {
    return this.dataService.listProjects(req.user);
  }

  @Post('projects')
  async createProject(
    @Req() req: { user: any },
    @Body() body: { name: string; description?: string; organization_id?: string | null },
  ) {
    this.ensureCanManageUsers(req.user);
    if (!body?.name?.trim()) {
      throw new BadRequestException('Project name is required');
    }
    return this.dataService.createProject(req.user, body);
  }

  @Patch('projects/:id')
  async updateProject(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string | null },
  ) {
    this.ensureCanManageUsers(req.user);
    const updated = await this.dataService.updateProject(req.user, id, body);
    if (!updated) throw new NotFoundException('Project not found');
    return updated;
  }

  @Delete('projects/:id')
  async deleteProject(@Req() req: { user: any }, @Param('id') id: string) {
    this.ensureAdmin(req.user);
    const deleted = await this.dataService.deleteProject(req.user, id);
    if (!deleted) throw new NotFoundException('Project not found');
    return { success: true };
  }

  @Get('projects/:id/assignment-count')
  async projectAssignmentCount(@Req() req: { user: any }, @Param('id') id: string) {
    return { count: await this.dataService.countProjectAssignments(req.user, id) };
  }

  @Get('projects/:id/assignments')
  async listProjectAssignments(@Req() req: { user: any }, @Param('id') id: string) {
    this.ensureCanManageUsers(req.user);
    const rows = await this.dataService.listProjectAssignments(req.user, id);
    if (rows == null) throw new NotFoundException('Project not found');
    return rows;
  }

  @Post('projects/:id/assignments')
  async setProjectAssignments(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Body() body: { user_ids?: unknown[] },
  ) {
    this.ensureCanManageUsers(req.user);
    return this.dataService.setProjectAssignments(req.user, id, body?.user_ids ?? []);
  }

  @Delete('projects/:id/assignments/:userId')
  async unassignUserFromProject(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    this.ensureCanManageUsers(req.user);
    const ok = await this.dataService.unassignUserFromProject(req.user, id, userId);
    if (!ok) throw new NotFoundException('Assignment not found');
    return { success: true };
  }

  @Delete('projects/:id/assignments')
  async deleteProjectAssignments(@Req() req: { user: any }, @Param('id') id: string) {
    this.ensureAdmin(req.user);
    await this.dataService.deleteProjectAssignments(req.user, id);
    return { success: true };
  }

  @Patch('time-logs/:id')
  async closeTimeLog(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Body() body: { end_time?: string },
  ) {
    this.ensureAdmin(req.user);
    const updated = await this.dataService.closeTimeLog(req.user, id, body?.end_time);
    if (!updated) throw new NotFoundException('Time log not found or already closed');
    return updated;
  }

  @Get('time-logs')
  async timeLogs(
    @Req() req: { user: any },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('detailed') detailed?: string,
  ) {
    return this.dataService.listTimeLogs(
      req.user,
      start,
      end,
      userId,
      limit ? Number(limit) : undefined,
      detailed === '1' || detailed === 'true',
    );
  }

  /** Append-only payroll audit trail (time_log_events). Managers/admins. */
  @Get('time-log-events')
  async timeLogEvents(
    @Req() req: { user: any },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('timeLogId') timeLogId?: string,
    @Query('shortenedOnly') shortenedOnly?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
  ) {
    this.ensureCanManageUsers(req.user);
    if ((start && !end) || (!start && end)) {
      throw new BadRequestException('Both start and end are required for date filtering');
    }
    return this.dataService.listTimeLogEvents(req.user, {
      start,
      end,
      userId,
      timeLogId,
      shortenedOnly: shortenedOnly === '1' || shortenedOnly === 'true',
      action,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('app-logs')
  async appLogs(
    @Req() req: { user: any },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    if ((start && !end) || (!start && end)) {
      throw new BadRequestException('Both start and end are required for date filtering');
    }
    return this.dataService.listAppLogs(
      req.user,
      start,
      end,
      userId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('url-logs')
  async urlLogs(
    @Req() req: { user: any },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    if ((start && !end) || (!start && end)) {
      throw new BadRequestException('Both start and end are required for date filtering');
    }
    return this.dataService.listUrlLogs(
      req.user,
      start,
      end,
      userId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('idle-logs')
  async idleLogs(
    @Req() req: { user: any },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    if ((start && !end) || (!start && end)) {
      throw new BadRequestException('Both start and end are required for date filtering');
    }
    return this.dataService.listIdleLogs(
      req.user,
      start,
      end,
      userId,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('organizations')
  async organizations(@Req() req: { user: any }) {
    return this.dataService.listOrganizations(req.user);
  }

  @Get('screenshots')
  async screenshots(
    @Req() req: { user: any },
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('userIds') userIdsRaw?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('includeTotal') includeTotal?: string,
    @Query('productivity') productivity?: string,
    @Query('sort') sort?: string,
  ) {
    const userIds = userIdsRaw
      ? userIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    const hasDateRange = Boolean(start || end);
    if (!hasDateRange && !userId && !userIds?.length) {
      throw new BadRequestException(
        'userId is required when no date range (start/end) is provided',
      );
    }
    if ((start && !end) || (!start && end)) {
      throw new BadRequestException('Both start and end are required for date filtering');
    }
    if (userId && userIds?.length) {
      throw new BadRequestException('Use either userId or userIds, not both');
    }
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedOffset = offset ? Number(offset) : undefined;
    const productivityFilter = normalizeScreenshotProductivityFilter(productivity);
    const sortBy = normalizeScreenshotSort(sort);
    const rows = await this.dataService.listScreenshots(
      req.user,
      start,
      end,
      userId,
      parsedLimit,
      parsedOffset,
      userIds,
      productivityFilter,
      sortBy,
    );
    if (includeTotal === '1' || includeTotal === 'true') {
      const total = await this.dataService.countScreenshots(
        req.user,
        start,
        end,
        userId,
        userIds,
        productivityFilter,
      );
      return {
        items: rows,
        total,
        limit: parsedLimit ?? 10000,
        offset: parsedOffset ?? 0,
      };
    }
    return rows;
  }

  @Delete('screenshots/:id')
  async deleteScreenshot(@Req() req: { user: any }, @Param('id') id: string) {
    const result = await this.dataService.deleteScreenshot(req.user, id);
    if (!result.deleted) throw new NotFoundException('Screenshot not found');
    return {
      success: true,
      deductedSeconds: result.deductedSeconds,
      timeLogId: result.timeLogId,
    };
  }

  @Get('users/:id/projects')
  async listUserProjects(@Req() req: { user: any }, @Param('id') id: string) {
    this.ensureCanManageUsers(req.user);
    const rows = await this.dataService.listUserProjects(req.user, id);
    if (rows == null) throw new NotFoundException('User not found');
    return rows;
  }

  @Post('users/:id/projects')
  async setUserProjects(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Body() body: { project_ids?: unknown[] },
  ) {
    this.ensureCanManageUsers(req.user);
    return this.dataService.setUserProjects(req.user, id, body?.project_ids ?? []);
  }

  @Delete('users/:id')
  async deleteUser(@Req() req: { user: any }, @Param('id') id: string) {
    this.ensureCanManageUsers(req.user);
    const deleted = await this.dataService.deleteUser(req.user, id);
    if (!deleted) throw new NotFoundException('User not found');
    return { success: true };
  }
}

