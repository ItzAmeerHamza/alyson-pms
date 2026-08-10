import type { Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { TrackedTimeModule } from '../tracked-time/tracked-time.module';
import { TimeLogsExportService } from '../tracked-time/time-logs-export.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CommonModule,
    TrackedTimeModule,
  ],
})
class TimeLogsExportAppModule {}

let exporter: TimeLogsExportService | null = null;

async function getExporter(): Promise<TimeLogsExportService> {
  if (!exporter) {
    const app = await NestFactory.createApplicationContext(TimeLogsExportAppModule, {
      logger: ['error', 'warn', 'log'],
    });
    exporter = app.get(TimeLogsExportService);
  }
  return exporter;
}

/**
 * EventBridge every 15 minutes: incremental export of time_doctor.time_logs → S3 NDJSON
 * for Athena (Hive partitions under tracked-time/time_logs/dt=YYYY-MM-DD/).
 */
export const handler: Handler = async () => {
  const service = await getExporter();
  const result = await service.exportIncremental();
  return { ok: true, ...result };
};
