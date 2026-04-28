import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AIAnalysisController } from './ai-analysis.controller';
import { AIAnalysisSchedulerService } from '../cron/ai-analysis-scheduler.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-analysis',
    }),
  ],
  controllers: [AIAnalysisController],
  providers: [AIAnalysisSchedulerService],
  exports: [AIAnalysisSchedulerService],
})
export class AIAnalysisModule {} 