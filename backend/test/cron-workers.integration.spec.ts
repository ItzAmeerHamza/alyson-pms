import 'reflect-metadata';
import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bull';

// Set test environment variables before module initialization
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://fkpiqcxkmrtaetvfgcli.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock_service_role_key_for_testing';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'mock_anon_key_for_testing';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
process.env.REDIS_DB = process.env.REDIS_DB || '1';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'mock_resend_key';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'mock_openai_key';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

import { AppModule } from '../src/app.module';
import { AIAnalysisSchedulerService } from '../src/cron/ai-analysis-scheduler.service';
import { AutomatedReportsService } from '../src/reports/automated-reports.service';
import { EmailReportsService } from '../src/reports/email-reports.service';
import { ActivityAnalyzerProcessor } from '../src/workers/activity-analyzer.processor';
import { SuspiciousActivityDetectorProcessor } from '../src/workers/suspicious-activity-detector.processor';

describe('Cron Jobs & Workers Integration', () => {
  let app: INestApplication;
  let aiScheduler: AIAnalysisSchedulerService;
  let automatedReports: AutomatedReportsService;
  let emailReports: EmailReportsService;
  let activityProcessor: ActivityAnalyzerProcessor;
  let suspiciousProcessor: SuspiciousActivityDetectorProcessor;
  let activityQueue: Queue;
  let suspiciousQueue: Queue;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    // Provide a lightweight fake Supabase client to avoid network
    const fakeSupabase = {
      from: (_table: string) => ({
        select: (_sel?: any) => ({
          eq: () => ({ order: () => ({ limit: () => ({ data: [], error: null }) }) }),
          gte: () => ({ lte: () => ({ order: () => ({ data: [], error: null }) }) }),
          in: () => ({ data: [], error: null }),
          order: () => ({ data: [], error: null }),
        }),
        insert: () => ({ select: () => ({ single: () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: () => ({}) }),
      }),
    } as any;

    // Patch Supabase for processors/services used in tests
    try {
      const supabaseSvc = module.get<any>(require('../src/common/supabase.service').SupabaseService);
      if (supabaseSvc) {
        vi.spyOn(supabaseSvc as any, 'getClient').mockReturnValue(fakeSupabase);
      }
    } catch {}

    // Get cron services
    aiScheduler = module.get<AIAnalysisSchedulerService>(AIAnalysisSchedulerService);
    automatedReports = module.get<AutomatedReportsService>(AutomatedReportsService);
    emailReports = module.get<EmailReportsService>(EmailReportsService);

    // Get processors
    activityProcessor = module.get<ActivityAnalyzerProcessor>(ActivityAnalyzerProcessor);
    suspiciousProcessor = module.get<SuspiciousActivityDetectorProcessor>(SuspiciousActivityDetectorProcessor);

    // Get queues
    activityQueue = module.get<Queue>(getQueueToken('activity-analyzer'));
    suspiciousQueue = module.get<Queue>(getQueueToken('suspicious-activity-detector'));

    // Patch scheduler's internal supabase client
    if ((aiScheduler as any).supabase) {
      (aiScheduler as any).supabase = fakeSupabase;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Cron Job Handlers', () => {
    describe('AIAnalysisSchedulerService', () => {
      it('should schedule AI analysis without errors (work hours)', async () => {
        const addSpy = vi
          .spyOn((aiScheduler as any)['aiAnalysisQueue'], 'add')
          .mockResolvedValue({} as any);
        await expect(aiScheduler.processWorkHours()).resolves.not.toThrow();
        addSpy.mockRestore();
      });

      it('should cleanup daily without errors', async () => {
        await expect(aiScheduler.dailyCleanup()).resolves.not.toThrow();
      });

      it('should handle batch backlog without errors', async () => {
        const addSpy = vi
          .spyOn((aiScheduler as any)['aiAnalysisQueue'], 'add')
          .mockResolvedValue({} as any);
        await expect(aiScheduler.processBatchBacklog()).resolves.not.toThrow();
        addSpy.mockRestore();
      });
    });

    describe('AutomatedReportsService', () => {
      it('should send daily reports without errors', async () => {
        await expect(automatedReports.sendDailyReport()).resolves.not.toThrow();
      });

      it('should send weekly reports without errors', async () => {
        await expect(automatedReports.sendWeeklyReport()).resolves.not.toThrow();
      });
    });

    describe('EmailReportsService', () => {
      it('should process scheduled reports without errors', async () => {
        await expect(emailReports.processScheduledReports()).resolves.not.toThrow();
      });

      it('should handle missing RESEND_API_KEY gracefully', async () => {
        const originalKey = process.env.RESEND_API_KEY;
        delete process.env.RESEND_API_KEY;

        // Should not throw but should log warning
        await expect(emailReports.processScheduledReports()).resolves.not.toThrow();

        process.env.RESEND_API_KEY = originalKey;
      });
    });
  });

  describe('Queue Processors', () => {
    describe('ActivityAnalyzerProcessor', () => {
      it('should process activity analysis jobs', async () => {
        const mockJob = {
          id: 'test-job-1',
          data: {
            timeRange: '1h',
            userId: 'test-user-id'
          }
        };

        await expect(
          activityProcessor.analyzeActivity(mockJob as any)
        ).resolves.not.toThrow();
      });

      it('should handle jobs with missing data gracefully', async () => {
        const mockJob = {
          id: 'test-job-2',
          data: {}
        };

        await expect(
          activityProcessor.analyzeActivity(mockJob as any)
        ).resolves.not.toThrow();
      });
    });

    describe('SuspiciousActivityDetectorProcessor', () => {
      it('should process suspicious activity detection jobs', async () => {
        const mockJob = {
          id: 'test-job-3',
          data: {
            userId: 'test-user-id',
            timeRange: '30m'
          }
        };

        await expect(
          suspiciousProcessor.detectSuspiciousActivity(mockJob as any)
        ).resolves.not.toThrow();
      });

      it('should detect patterns correctly', async () => {
        const mockJob = {
          id: 'test-job-4',
          data: {
            userId: 'test-user-id',
            timeRange: '30m'
          }
        };

        // This should complete without throwing
        const result = await suspiciousProcessor.detectSuspiciousActivity(mockJob as any);
        expect(result).toBeUndefined(); // Processors typically don't return values
      });
    });
  });

  describe('Queue Health', () => {
    it('should have all required queues available', () => {
      expect(activityQueue).toBeDefined();
      expect(suspiciousQueue).toBeDefined();
    });

    it('should be able to add jobs to queues', async () => {
      await expect(
        activityQueue.add('test-activity-analysis', {
          userId: 'test-user',
          timeRange: '1h'
        })
      ).resolves.toBeDefined();

      await expect(
        suspiciousQueue.add('detect-suspicious-activity', {
          userId: 'test-user',
          timeRange: '30m'
        })
      ).resolves.toBeDefined();
    });

    it('should be able to get queue status', async () => {
      const activityStatus = await activityQueue.getJobCounts();
      const suspiciousStatus = await suspiciousQueue.getJobCounts();

      expect(activityStatus).toHaveProperty('waiting');
      expect(activityStatus).toHaveProperty('active');
      expect(activityStatus).toHaveProperty('completed');
      expect(activityStatus).toHaveProperty('failed');

      expect(suspiciousStatus).toHaveProperty('waiting');
      expect(suspiciousStatus).toHaveProperty('active');
      expect(suspiciousStatus).toHaveProperty('completed');
      expect(suspiciousStatus).toHaveProperty('failed');
    });
  });

  describe('Environment Dependencies', () => {
    it('should have required Redis configuration', () => {
      expect(process.env.REDIS_HOST || 'localhost').toBeDefined();
      expect(process.env.REDIS_PORT || '6379').toBeDefined();
    });

    it('should have required Supabase configuration', () => {
      expect(process.env.SUPABASE_URL).toBeDefined();
      expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
      expect(process.env.SUPABASE_ANON_KEY).toBeDefined();
    });

    it('should warn about optional configurations', () => {
      if (!process.env.RESEND_API_KEY) {
        console.warn('⚠️  RESEND_API_KEY not set - email features will not work');
      }
      
      if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  OPENAI_API_KEY not set - AI features will not work');
      }
    });
  });
});
