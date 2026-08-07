import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ScreenshotAiBackfillService } from './screenshot-ai-backfill.service';
import { ScreenshotAiQueueService } from './screenshot-ai-queue.service';
import { ScreenshotAiRepository } from './screenshot-ai.repository';
import { BackfillOptions } from './screenshot-ai.types';

@Controller('pulse/ai-analysis')
@UseGuards(AuthGuard)
export class ScreenshotAiController {
  constructor(
    private readonly repo: ScreenshotAiRepository,
    private readonly backfill: ScreenshotAiBackfillService,
    private readonly queue: ScreenshotAiQueueService,
  ) {}

  private ensureAdmin(user: { role?: string; is_super_admin?: boolean }) {
    if (!(user?.is_super_admin || user?.role === 'admin')) {
      throw new ForbiddenException('Admin role required');
    }
  }

  @Get('status')
  async status(@Req() req: { user: { role?: string; is_super_admin?: boolean } }) {
    this.ensureAdmin(req.user);
    const counts = await this.repo.getStatusCounts();
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
    @Req() req: { user: { role?: string; is_super_admin?: boolean } },
    @Body() body: BackfillOptions,
  ) {
    this.ensureAdmin(req.user);
    const result = await this.backfill.enqueuePending(body);
    return { success: true, ...result };
  }

  @Post('retry-failed')
  async retryFailed(
    @Req() req: { user: { role?: string; is_super_admin?: boolean } },
    @Body() body: { limit?: number },
  ) {
    this.ensureAdmin(req.user);
    const reset = await this.repo.resetFailedToPending(body.limit ?? 500);
    const result = await this.backfill.enqueuePending({
      limit: body.limit ?? 500,
      includeFailed: false,
    });
    return { success: true, reset, ...result };
  }
}
