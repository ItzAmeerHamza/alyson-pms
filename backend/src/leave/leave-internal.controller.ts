import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../auth/api-key.guard';
import type { LeaveScanIngestBatchRequest } from './leave-scan.types';
import { LeaveService } from './leave.service';

/**
 * Called by the non-VPC leave-scan worker (Gmail + DeepSeek) to persist results.
 * Auth: x-api-key (INTERNAL_API_KEY) — same pattern as screenshot-ai internal.
 */
@Controller('pulse/leave/internal')
@UseGuards(ApiKeyGuard)
@SkipThrottle({ default: true, strict: true })
export class LeaveInternalController {
  constructor(private readonly leave: LeaveService) {}

  @Post('ingest-batch')
  ingestBatch(@Body() body: LeaveScanIngestBatchRequest) {
    return this.leave.ingestScanBatch(body);
  }
}
