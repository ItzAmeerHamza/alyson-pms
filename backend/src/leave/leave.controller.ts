import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import {
  AssignInboxLeaveDto,
  CreateLeaveEventDto,
  CreateTeamLeaveEventDto,
  LeaveScanDto,
} from './dto/leave.dto';
import { LeaveService } from './leave.service';

@Controller('pulse/leave')
@UseGuards(AuthGuard)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('status')
  getStatus(@Req() req: { user: any }) {
    return this.leave.getScanStatus(req.user);
  }

  @Post('scan')
  scan(@Req() req: { user: any }, @Body() body: LeaveScanDto) {
    return this.leave.scanInbox(req.user, {
      query: body?.query,
      maxMessages: body?.maxMessages,
      period: body?.period,
    });
  }

  @Get('inbox')
  listInbox(
    @Req() req: { user: any },
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
    @Query('period') period?: string,
  ) {
    return this.leave.listInbox(req.user, {
      limit: limit ? Number(limit) : 200,
      filter,
      period,
    });
  }

  @Post('inbox/:id/assign')
  assignInbox(
    @Req() req: { user: any },
    @Param('id') id: string,
    @Body() body: AssignInboxLeaveDto,
  ) {
    return this.leave.assignInboxMessage(req.user, id, body);
  }

  @Post('inbox/:id/approve')
  approveInbox(@Req() req: { user: any }, @Param('id') id: string) {
    return this.leave.approveInboxMessage(req.user, id);
  }

  @Post('inbox/:id/reject')
  rejectInbox(@Req() req: { user: any }, @Param('id') id: string) {
    return this.leave.rejectInboxMessage(req.user, id);
  }

  @Get('employees')
  employees(@Req() req: { user: any }) {
    return this.leave.getEmployeeLedgers(req.user);
  }

  @Get('events')
  listEvents(
    @Req() req: { user: any },
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.leave.listEvents(req.user, { status, userId });
  }

  @Post('events')
  createEvent(@Req() req: { user: any }, @Body() body: CreateLeaveEventDto) {
    return this.leave.createEvent(req.user, {
      userId: body.userId,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note,
      halfDay: body.halfDay,
      source: 'manual',
    });
  }

  @Post('events/:id/void')
  voidEvent(@Req() req: { user: any }, @Param('id') id: string) {
    return this.leave.voidEvent(req.user, id);
  }

  @Get('team-events')
  listTeamEvents(@Req() req: { user: any }, @Query('status') status?: string) {
    return this.leave.listTeamEvents(req.user, { status });
  }

  @Post('team-events')
  createTeamEvent(@Req() req: { user: any }, @Body() body: CreateTeamLeaveEventDto) {
    return this.leave.createTeamEvent(req.user, {
      location: body.location,
      team: body.team,
      leaveType: body.leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      note: body.note,
    });
  }

  @Post('team-events/:id/void')
  voidTeamEvent(@Req() req: { user: any }, @Param('id') id: string) {
    return this.leave.voidTeamEvent(req.user, id);
  }

  @Get('calendar')
  calendar(@Req() req: { user: any }, @Query('month') month: string) {
    const m =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month
        : new Date().toISOString().slice(0, 7);
    return this.leave.getCalendar(req.user, m);
  }

  @Get('analytics')
  analytics(@Req() req: { user: any }, @Query('year') year?: string) {
    return this.leave.getAnalytics(req.user, year ? Number(year) : undefined);
  }

  @Get('audit')
  audit(@Req() req: { user: any }, @Query('limit') limit?: string) {
    return this.leave.getAuditLog(req.user, limit ? Number(limit) : 100);
  }
}
