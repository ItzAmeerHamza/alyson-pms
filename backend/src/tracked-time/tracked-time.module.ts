import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { TimeLogsExportService } from './time-logs-export.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  providers: [TimeLogsExportService],
  exports: [TimeLogsExportService],
})
export class TrackedTimeModule {}
