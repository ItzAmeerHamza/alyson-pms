import { Module } from '@nestjs/common';
import { StaleSessionCleanupService } from './stale-session-cleanup.service';

/**
 * CronModule - Contains scheduled task services
 * 
 * Note: AIAnalysisSchedulerService is provided by AIAnalysisModule which also
 * registers the 'ai-analysis' Bull queue. This module only contains services
 * that don't require the queue (like StaleSessionCleanupService).
 */
@Module({
  providers: [
    StaleSessionCleanupService,
  ],
  exports: [
    StaleSessionCleanupService,
  ],
})
export class CronModule {}

