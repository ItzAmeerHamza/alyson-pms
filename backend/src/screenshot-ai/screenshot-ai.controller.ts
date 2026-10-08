import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BILLING_FEATURES } from '../billing/billing.catalog';
import { BillingFeatureGuard, RequireBillingFeature } from '../billing/billing-feature.guard';
import {
  isPulseOrgAdmin,
  parseWorkspaceId,
  pulseTenantForbiddenMessage,
} from '../database/time-doctor-sql';
import { ScreenshotAiBackfillService } from './screenshot-ai-backfill.service';
import { ScreenshotAiQueueService } from './screenshot-ai-queue.service';
import { ScreenshotAiRepository } from './screenshot-ai.repository';
import { BackfillOptions } from './screenshot-ai.types';

@Controller('pulse/ai-analysis')
@UseGuards(AuthGuard, BillingFeatureGuard)
@RequireBillingFeature(BILLING_FEATURES.screenshotAi)
export class ScreenshotAiController {
  constructor(
    private readonly repo: ScreenshotAiRepository,
    private readonly backfill: ScreenshotAiBackfillService,
    private readonly queue: ScreenshotAiQueueService,
  ) {}

  private ensureAdmin(user: {
    role?: string;
    is_super_admin?: boolean;
    organization_id?: string | null;
  }) {
    const tenantMsg = pulseTenantForbiddenMessage(user);
    if (tenantMsg) {
      throw new ForbiddenException(tenantMsg);
    }
    if (!isPulseOrgAdmin(user)) {
      throw new ForbiddenException('Admin role required');
    }
  }

  private requireWorkspaceId(user: { organization_id?: string | null }): number {
    const workspaceId = parseWorkspaceId(user.organization_id);
    if (!workspaceId) {
      throw new ForbiddenException(pulseTenantForbiddenMessage(user) || 'Admin role required');
    }
    return workspaceId;
  }

  @Get('status')
  async status(@Req() req: { user: { role?: string; is_super_admin?: boolean; organization_id?: string | null } }) {
    this.ensureAdmin(req.user);
    const workspaceId = this.requireWorkspaceId(req.user);
    const counts = await this.repo.getStatusCounts(workspaceId);
    return {
      enabled: this.queue.isEnabled(),
      counts,
      progress_percent:
        counts.total > 0
          ? Math.round((counts.completed / counts.total) * 1000) / 10
          : 0,
    };
  }

  @Post('backfill')
  async runBackfill(
    @Req() req: { user: { role?: string; is_super_admin?: boolean; organization_id?: string | null } },
    @Body() body: BackfillOptions,
  ) {
    this.ensureAdmin(req.user);
    const workspaceId = this.requireWorkspaceId(req.user);
    const result = await this.backfill.enqueuePending({ ...body, workspaceId });
    return { success: true, ...result };
  }

  @Post('retry-failed')
  async retryFailed(
    @Req() req: { user: { role?: string; is_super_admin?: boolean; organization_id?: string | null } },
    @Body() body: { limit?: number },
  ) {
    this.ensureAdmin(req.user);
    const workspaceId = this.requireWorkspaceId(req.user);
    const reset = await this.repo.resetFailedToPending(body.limit ?? 500, workspaceId);
    const result = await this.backfill.enqueuePending({
      limit: body.limit ?? 500,
      includeFailed: false,
      workspaceId,
    });
    return { success: true, reset, ...result };
  }
}
