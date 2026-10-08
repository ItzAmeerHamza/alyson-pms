import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BILLING_FEATURES } from '../billing/billing.catalog';
import { BillingFeatureGuard, RequireBillingFeature } from '../billing/billing-feature.guard';
import { canManagePulseUsers, isPulseOrgAdmin, pulseTenantForbiddenMessage } from '../database/time-doctor-sql';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

@Controller('pulse')
@UseGuards(AuthGuard, BillingFeatureGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Provision a new employee (admin or manager): Cognito user + RDS records. */
  @Post('users')
  @RequireBillingFeature(BILLING_FEATURES.seats)
  async createUser(@Req() req: { user: any }, @Body() body: CreateUserDto) {
    const tenantMsg = pulseTenantForbiddenMessage(req.user);
    if (tenantMsg) throw new ForbiddenException(tenantMsg);
    if (!canManagePulseUsers(req.user)) {
      throw new ForbiddenException('Admin or manager role required');
    }
    // Only org admins may create other admins.
    if (body.role === 'admin' && !isPulseOrgAdmin(req.user)) {
      throw new BadRequestException('Only admins can create admin users');
    }
    return this.users.createUser(req.user, body);
  }

  /** New temporary password + Pulse invite email (does not change Cognito username). */
  @Post('users/:id/resend-invite')
  async resendInvite(@Req() req: { user: any }, @Param('id') id: string) {
    const tenantMsg = pulseTenantForbiddenMessage(req.user);
    if (tenantMsg) throw new ForbiddenException(tenantMsg);
    if (!canManagePulseUsers(req.user)) {
      throw new ForbiddenException('Admin or manager role required');
    }
    return this.users.resendInvite(req.user, id);
  }
}
