import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { isPulseOrgAdmin } from '../database/time-doctor-sql';
import { AccessGrantsService } from './access-grants.service';
import { CreateAccessGrantDto, UpdateAccessGrantDto } from './dto/upsert-access-grant.dto';

@Controller('pulse/access-grants')
@UseGuards(AuthGuard)
export class AccessGrantsController {
  constructor(private readonly grants: AccessGrantsService) {}

  private ensureAdmin(user: { role?: string; is_super_admin?: boolean }) {
    if (!isPulseOrgAdmin(user)) {
      throw new ForbiddenException('Admin role required');
    }
  }

  /** Current user's delegated target ids (empty when none). */
  @Get('me')
  async myGrant(@Req() req: { user: any }) {
    const target_user_ids = await this.grants.getGrantedTargetIds(req.user);
    return { target_user_ids };
  }

  @Get()
  async list(@Req() req: { user: any }) {
    this.ensureAdmin(req.user);
    return this.grants.listGrants(req.user);
  }

  @Post()
  async create(@Req() req: { user: any }, @Body() body: CreateAccessGrantDto) {
    this.ensureAdmin(req.user);
    return this.grants.createGrant(req.user, body);
  }

  @Patch(':id')
  async update(
    @Req() req: { user: any },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAccessGrantDto,
  ) {
    this.ensureAdmin(req.user);
    return this.grants.updateGrant(req.user, id, body);
  }

  @Delete(':id')
  async remove(@Req() req: { user: any }, @Param('id', ParseIntPipe) id: number) {
    this.ensureAdmin(req.user);
    const result = await this.grants.deleteGrant(req.user, id);
    if (!result.deleted) throw new NotFoundException('Access grant not found');
    return { success: true };
  }
}
