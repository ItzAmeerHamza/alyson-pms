import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../auth/auth.guard';
import {
  isPulseOrgAdmin,
  parseWorkspaceId,
  pulseTenantForbiddenMessage,
} from '../database/time-doctor-sql';
import { BillingService } from './billing.service';
import { CheckoutDto, PortalDto } from './dto/checkout.dto';

@Controller('pulse/billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async entitlements(@Req() req: { user: { role?: string; is_super_admin?: boolean; organization_id?: string | null } }) {
    const workspaceId = this.workspaceId(req.user);
    if (!workspaceId) return this.billing.disabledEntitlements();
    return this.billing.entitlements(workspaceId);
  }

  @Post('checkout')
  async checkout(
    @Req() req: { user: { role?: string; is_super_admin?: boolean; organization_id?: string | null } },
    @Body() body: CheckoutDto,
    @Headers('origin') origin?: string,
  ) {
    this.ensureOrgAdmin(req.user);
    const workspaceId = this.requireWorkspace(req.user);
    const successUrl = this.publicUrl(origin, body.returnPath || '/dashboard/alyson-pulse/billing');
    const paymentUrl = await this.billing.attach(workspaceId, body.planId, successUrl);
    return { paymentUrl };
  }

  @Post('portal')
  async portal(
    @Req() req: { user: { role?: string; is_super_admin?: boolean; organization_id?: string | null } },
    @Body() body: PortalDto,
    @Headers('origin') origin?: string,
  ) {
    this.ensureOrgAdmin(req.user);
    const workspaceId = this.requireWorkspace(req.user);
    const returnUrl = this.publicUrl(origin, body.returnPath || '/dashboard/alyson-pulse/billing');
    const url = await this.billing.portal(workspaceId, returnUrl);
    return { url };
  }

  private workspaceId(user: { organization_id?: string | null }): string | null {
    const id = parseWorkspaceId(user.organization_id);
    return id ? String(id) : null;
  }

  private requireWorkspace(user: { is_super_admin?: boolean; organization_id?: string | null }): string {
    const id = this.workspaceId(user);
    if (!id) {
      throw new ForbiddenException(pulseTenantForbiddenMessage(user) || 'Select a company');
    }
    return id;
  }

  private ensureOrgAdmin(user: {
    role?: string;
    is_super_admin?: boolean;
    organization_id?: string | null;
  }) {
    const message = pulseTenantForbiddenMessage(user);
    if (message) throw new ForbiddenException(message);
    if (!isPulseOrgAdmin(user)) throw new ForbiddenException('Admin role required');
  }

  private publicUrl(origin: string | undefined, path: string): string | undefined {
    const allowed = (this.config.get<string>('ALLOWED_ORIGINS') || '')
      .split(',')
      .map((item) => item.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const cleanOrigin = (origin || '').trim().replace(/\/$/, '');
    if (!cleanOrigin || !allowed.includes(cleanOrigin)) return undefined;
    return `${cleanOrigin}${path}`;
  }
}
