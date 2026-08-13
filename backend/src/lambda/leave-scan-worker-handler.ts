import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { ScreenshotAiModule } from '../screenshot-ai/screenshot-ai.module';
import { GmailDwdService } from '../leave/gmail-dwd.service';
import { LeaveClassifyService } from '../leave/leave-classify.service';
import { LeaveScanWorkerService } from '../leave/leave-scan-worker.service';
import type { LeaveScanJob } from '../leave/leave-scan.types';

/**
 * Non-VPC Lambda: Gmail DWD + DeepSeek leave intake.
 * API Lambda (VPC, no NAT) Event-invokes this, then this POSTs ingest-batch back.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CommonModule, ScreenshotAiModule],
  providers: [GmailDwdService, LeaveClassifyService, LeaveScanWorkerService],
})
class LeaveScanWorkerAppModule {}

let worker: LeaveScanWorkerService | null = null;

async function getWorker(): Promise<LeaveScanWorkerService> {
  if (!worker) {
    const app = await NestFactory.createApplicationContext(LeaveScanWorkerAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    worker = app.get(LeaveScanWorkerService);
  }
  return worker;
}

export const handler = async (event: LeaveScanJob): Promise<{ ok: boolean }> => {
  const service = await getWorker();
  await service.run(event);
  return { ok: true };
};
