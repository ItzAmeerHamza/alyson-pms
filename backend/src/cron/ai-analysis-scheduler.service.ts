import { Injectable, Logger } from '@nestjs/common';
// DISABLED: Using Supabase pg_cron instead of NestJS cron for simplicity
// import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient } from '@supabase/supabase-js';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';

/**
 * AIAnalysisSchedulerService
 * 
 * NOTE: Cron jobs are DISABLED - we now use Supabase pg_cron for all scheduled tasks.
 * This service is kept for manual triggers and utility methods only.
 * 
 * Supabase pg_cron handles:
 * - ai-screenshot-processor (every 5 min)
 * - ai-insights-generator-hourly (hourly)
 * - ai-insights-generator-daily (daily 8 PM)
 * - daily-email-report-v2 (daily 7 PM UTC)
 * - weekly-email-report-v2 (Thursday 7 PM UTC)
 */
@Injectable()
export class AIAnalysisSchedulerService {
  private readonly logger = new Logger(AIAnalysisSchedulerService.name);
  private readonly supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  );

  constructor(
    @InjectQueue('ai-analysis') private aiAnalysisQueue: Queue,
  ) {}

  // DISABLED: Now handled by Supabase pg_cron 'ai-screenshot-processor'
  // @Cron('*/10 8-18 * * 1-5', { timeZone: 'UTC' })
  async processWorkHours() {
    this.logger.log('Processing AI analysis during work hours');
    await this.processPendingScreenshots(50, 'high');
  }

  // DISABLED: Now handled by Supabase pg_cron
  // @Cron('*/30 0-7,19-23 * * 1-5', { timeZone: 'UTC' })
  async processOffHours() {
    this.logger.log('Processing AI analysis during off hours');
    await this.processPendingScreenshots(25, 'medium');
  }

  // DISABLED: Now handled by Supabase pg_cron
  // @Cron('0 * * * 6,0', { timeZone: 'UTC' })
  async processWeekends() {
    this.logger.log('Processing AI analysis on weekends');
    await this.processPendingScreenshots(30, 'low');
  }

  // DISABLED: Now handled by Supabase pg_cron
  // @Cron('0 */2 * * *', { timeZone: 'UTC' })
  async processBatchBacklog() {
    this.logger.log('Processing batch backlog for AI analysis');
    await this.processPendingScreenshots(100, 'batch');
  }

  // DISABLED: Now handled by Supabase pg_cron 'ai-cleanup-failed'
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyCleanup() {
    this.logger.log('Running daily AI analysis cleanup');
    await this.cleanupFailedJobs();
    await this.retryFailedAnalysis();
    await this.logAnalysisStatistics();
  }

  // Process all unanalyzed screenshots (manual trigger or initial setup)
  async processAllUnanalyzed(batchSize = 50): Promise<void> {
    this.logger.log('Starting processing of ALL unanalyzed screenshots');
    
    try {
      let totalProcessed = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data: screenshots, error } = await this.supabase
          .from('screenshots')
          .select('id, user_id, image_url, captured_at')
          .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending')
          .order('captured_at', { ascending: true }) // Process oldest first
          .limit(batchSize);

        if (error) {
          this.logger.error('Error fetching unanalyzed screenshots:', error);
          break;
        }

        if (!screenshots || screenshots.length === 0) {
          hasMore = false;
          break;
        }

        // Add all screenshots to the queue with high priority
        for (const screenshot of screenshots) {
          await this.aiAnalysisQueue.add(
            'analyze-screenshot',
            {
              screenshotId: screenshot.id,
              userId: screenshot.user_id,
              imageUrl: screenshot.image_url,
              capturedAt: screenshot.captured_at,
              source: 'backlog_processing'
            },
            {
              priority: 100, // High priority for backlog processing
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              delay: Math.floor(Math.random() * 5000), // Random delay to prevent overwhelming
            }
          );
        }

        totalProcessed += screenshots.length;
        this.logger.log(`Processed batch of ${screenshots.length} screenshots. Total: ${totalProcessed}`);

        // Short delay between batches to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      this.logger.log(`Completed processing all unanalyzed screenshots. Total processed: ${totalProcessed}`);
    } catch (error) {
      this.logger.error('Error in processAllUnanalyzed:', error);
      throw error;
    }
  }

  private async processPendingScreenshots(batchSize: number, priority: 'high' | 'medium' | 'low' | 'batch'): Promise<void> {
    try {
      const { data: screenshots, error } = await this.supabase
        .from('screenshots')
        .select('id, user_id, image_url, captured_at')
        .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending')
        .order('captured_at', { ascending: false }) // Process newest first for regular processing
        .limit(batchSize);

      if (error) {
        this.logger.error('Error fetching pending screenshots:', error);
        return;
      }

      if (!screenshots || screenshots.length === 0) {
        this.logger.log('No pending screenshots found');
        return;
      }

      const priorityMap = {
        high: 80,
        medium: 60,
        low: 40,
        batch: 50
      };

      for (const screenshot of screenshots) {
        await this.aiAnalysisQueue.add(
          'analyze-screenshot',
          {
            screenshotId: screenshot.id,
            userId: screenshot.user_id,
            imageUrl: screenshot.image_url,
            capturedAt: screenshot.captured_at,
            source: `scheduled_${priority}`
          },
          {
            priority: priorityMap[priority],
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            delay: priority === 'batch' ? Math.floor(Math.random() * 3000) : 0,
          }
        );
      }

      this.logger.log(`Queued ${screenshots.length} screenshots for AI analysis (${priority} priority)`);
    } catch (error) {
      this.logger.error('Error processing pending screenshots:', error);
    }
  }

  private async cleanupFailedJobs(): Promise<void> {
    try {
      const failed = await this.aiAnalysisQueue.getFailed();
      const completed = await this.aiAnalysisQueue.getCompleted();

      // Remove old completed jobs (keep last 1000)
      if (completed.length > 1000) {
        const toRemove = completed.slice(0, completed.length - 1000);
        await Promise.all(toRemove.map(job => job.remove()));
        this.logger.log(`Cleaned up ${toRemove.length} old completed jobs`);
      }

      // Remove old failed jobs (keep last 500)
      if (failed.length > 500) {
        const toRemove = failed.slice(0, failed.length - 500);
        await Promise.all(toRemove.map(job => job.remove()));
        this.logger.log(`Cleaned up ${toRemove.length} old failed jobs`);
      }
    } catch (error) {
      this.logger.error('Error during cleanup:', error);
    }
  }

  private async retryFailedAnalysis(): Promise<void> {
    try {
      // Find screenshots that failed analysis and retry them
      const { data: failedScreenshots, error } = await this.supabase
        .from('screenshots')
        .select('id, user_id, image_url, captured_at')
        .eq('ai_analysis_status', 'failed')
        .order('captured_at', { ascending: false })
        .limit(20); // Retry up to 20 failed screenshots per day

      if (error) {
        this.logger.error('Error fetching failed screenshots:', error);
        return;
      }

      if (failedScreenshots && failedScreenshots.length > 0) {
        for (const screenshot of failedScreenshots) {
          await this.aiAnalysisQueue.add(
            'analyze-screenshot',
            {
              screenshotId: screenshot.id,
              userId: screenshot.user_id,
              imageUrl: screenshot.image_url,
              capturedAt: screenshot.captured_at,
              source: 'retry_failed'
            },
            {
              priority: 70, // Medium-high priority for retries
              attempts: 2, // Fewer attempts for retries
              backoff: { type: 'exponential', delay: 2000 },
            }
          );
        }

        this.logger.log(`Retrying ${failedScreenshots.length} failed AI analysis jobs`);
      }
    } catch (error) {
      this.logger.error('Error retrying failed analysis:', error);
    }
  }

  private async logAnalysisStatistics(): Promise<void> {
    try {
      const { data: stats, error } = await this.supabase
        .from('screenshots')
        .select('ai_analysis_status')
        .then(({ data, error }) => {
          if (error) return { data: null, error };
          
          const statusCounts = data.reduce((acc, row) => {
            const status = row.ai_analysis_status || 'null';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          return { data: statusCounts, error: null };
        });

      if (error) {
        this.logger.error('Error fetching analysis statistics:', error);
        return;
      }

      const queueStats = {
        waiting: await this.aiAnalysisQueue.getWaiting().then(jobs => jobs.length),
        active: await this.aiAnalysisQueue.getActive().then(jobs => jobs.length),
        completed: await this.aiAnalysisQueue.getCompleted().then(jobs => jobs.length),
        failed: await this.aiAnalysisQueue.getFailed().then(jobs => jobs.length),
      };

      this.logger.log('AI Analysis Statistics:', {
        database: stats,
        queue: queueStats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error logging statistics:', error);
    }
  }

  // Manual methods for external triggers
  async getAnalysisStatistics() {
    try {
      const { data: dbStats, error } = await this.supabase
        .from('screenshots')
        .select('ai_analysis_status')
        .then(({ data, error }) => {
          if (error) return { data: null, error };
          
          const statusCounts = data.reduce((acc, row) => {
            const status = row.ai_analysis_status || 'unanalyzed';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          return { data: statusCounts, error: null };
        });

      if (error) throw error;

      const queueStats = {
        waiting: await this.aiAnalysisQueue.getWaiting().then(jobs => jobs.length),
        active: await this.aiAnalysisQueue.getActive().then(jobs => jobs.length),
        completed: await this.aiAnalysisQueue.getCompleted().then(jobs => jobs.length),
        failed: await this.aiAnalysisQueue.getFailed().then(jobs => jobs.length),
      };

      return {
        database: dbStats,
        queue: queueStats,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error getting analysis statistics:', error);
      throw error;
    }
  }
} 