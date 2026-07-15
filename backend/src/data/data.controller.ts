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
import { isPulseAdmin } from '../database/time-doctor-sql';
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
    this.ensureAdmin(req.user);
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
    this.ensureAdmin(req.user);
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

  @Delete('users/:id')
  async deleteUser(@Req() req: { user: any }, @Param('id') id: string) {
    this.ensureAdmin(req.user);
    const deleted = await this.dataService.deleteUser(req.user, id);
    if (!deleted) throw new NotFoundException('User not found');
    return { success: true };
  }
}

