import { Controller, Post, Get, Body, HttpStatus, HttpException, Logger, UseGuards } from '@nestjs/common';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { AIAnalysisSchedulerService } from '../cron/ai-analysis-scheduler.service';
import { createClient } from '@supabase/supabase-js';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller('ai-analysis')
@UseGuards(ApiKeyGuard)
export class AIAnalysisController {
  private readonly logger = new Logger(AIAnalysisController.name);
  private readonly supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  );

  constructor(
    @InjectQueue('ai-analysis') private aiAnalysisQueue: Queue,
    private aiAnalysisScheduler: AIAnalysisSchedulerService,
  ) {}

  @Post('trigger')
  async triggerAnalysis(@Body() body: { batch_size?: number }) {
    try {
      const batchSize = body.batch_size || 50;
      this.logger.log(`Manual trigger: Starting AI analysis with batch size ${batchSize}`);
      
      const { data: screenshots, error } = await this.supabase
        .from('screenshots')
        .select('id, user_id, image_url, captured_at')
        .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending')
        .order('captured_at', { ascending: false })
        .limit(batchSize);

      if (error) {
        throw new HttpException('Failed to fetch screenshots', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!screenshots || screenshots.length === 0) {
        return {
          success: true,
          message: 'No screenshots pending analysis',
          queued: 0,
          timestamp: new Date().toISOString()
        };
      }

      for (const screenshot of screenshots) {
        await this.aiAnalysisQueue.add(
          'analyze-screenshot',
          {
            screenshotId: screenshot.id,
            userId: screenshot.user_id,
            imageUrl: screenshot.image_url,
            capturedAt: screenshot.captured_at,
            source: 'manual_trigger'
          },
          {
            priority: 90,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }
        );
      }

      this.logger.log(`Manually queued ${screenshots.length} screenshots for AI analysis`);
      
      return {
        success: true,
        message: `Queued ${screenshots.length} screenshots for AI analysis`,
        queued: screenshots.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error in manual trigger:', error);
      throw new HttpException('Failed to trigger analysis', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('process-all')
  async processAllUnanalyzed(@Body() body: { batch_size?: number }) {
    try {
      const batchSize = body.batch_size || 50;
      this.logger.log(`Processing ALL unanalyzed screenshots with batch size ${batchSize}`);
      
      // Start the background processing
      this.aiAnalysisScheduler.processAllUnanalyzed(batchSize).catch(error => {
        this.logger.error('Error in background processing:', error);
      });

      return {
        success: true,
        message: 'Started processing all unanalyzed screenshots in background',
        batch_size: batchSize,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error starting process-all:', error);
      throw new HttpException('Failed to start processing all screenshots', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('trigger-backlog')
  async triggerBacklogProcessing() {
    try {
      this.logger.log('Triggering intensive backlog processing');
      
      // Check current backlog size
      const { data: backlogCount, error } = await this.supabase
        .from('screenshots')
        .select('id', { count: 'exact' })
        .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending');

      if (error) {
        throw new HttpException('Failed to check backlog size', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const totalBacklog = backlogCount?.length || 0;
      this.logger.log(`Current backlog: ${totalBacklog} screenshots`);

      // Process in larger batches for backlog
      const { data: screenshots, error: fetchError } = await this.supabase
        .from('screenshots')
        .select('id, user_id, image_url, captured_at')
        .or('ai_analysis_status.is.null,ai_analysis_status.eq.pending')
        .order('captured_at', { ascending: true }) // Process oldest first
        .limit(100);

      if (fetchError) {
        throw new HttpException('Failed to fetch backlog screenshots', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!screenshots || screenshots.length === 0) {
        return {
          success: true,
          message: 'No backlog screenshots to process',
          total_backlog: totalBacklog,
          processed: 0,
          timestamp: new Date().toISOString()
        };
      }

      for (const screenshot of screenshots) {
        await this.aiAnalysisQueue.add(
          'analyze-screenshot',
          {
            screenshotId: screenshot.id,
            userId: screenshot.user_id,
            imageUrl: screenshot.image_url,
            capturedAt: screenshot.captured_at,
            source: 'backlog_trigger'
          },
          {
            priority: 95, // High priority for backlog processing
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            delay: Math.floor(Math.random() * 2000), // Random delay to prevent overwhelming
          }
        );
      }

      this.logger.log(`Queued ${screenshots.length} backlog screenshots for AI analysis`);
      
      return {
        success: true,
        message: `Queued ${screenshots.length} backlog screenshots for AI analysis`,
        total_backlog: totalBacklog,
        processed: screenshots.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error in backlog trigger:', error);
      throw new HttpException('Failed to trigger backlog processing', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('webhook')
  async handleWebhook(@Body() body: any) {
    try {
      this.logger.log('Received AI analysis webhook:', body);
      
      if (body.type === 'INSERT' && body.table === 'screenshots') {
        const screenshot = body.record;
        
        // Immediately queue new screenshots for AI analysis
        await this.aiAnalysisQueue.add(
          'analyze-screenshot',
          {
            screenshotId: screenshot.id,
            userId: screenshot.user_id,
            imageUrl: screenshot.image_url,
            capturedAt: screenshot.captured_at,
            source: 'webhook_realtime'
          },
          {
            priority: 100, // Highest priority for real-time processing
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          }
        );

        this.logger.log(`Queued new screenshot ${screenshot.id} for immediate AI analysis`);
      }

      return {
        success: true,
        message: 'Webhook processed successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      throw new HttpException('Failed to process webhook', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('statistics')
  async getStatistics() {
    try {
      const stats = await this.aiAnalysisScheduler.getAnalysisStatistics();
      
      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error getting statistics:', error);
      throw new HttpException('Failed to get statistics', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('health')
  async healthCheck() {
    try {
      const queueStats = {
        waiting: await this.aiAnalysisQueue.getWaiting().then(jobs => jobs.length),
        active: await this.aiAnalysisQueue.getActive().then(jobs => jobs.length),
        completed: await this.aiAnalysisQueue.getCompleted().then(jobs => jobs.length),
        failed: await this.aiAnalysisQueue.getFailed().then(jobs => jobs.length),
      };

      const { data: dbStats, error } = await this.supabase
        .from('screenshots')
        .select('ai_analysis_status')
        .limit(1000) // Sample for health check
        .then(({ data, error }) => {
          if (error) return { data: null, error };
          
          const statusCounts = data.reduce((acc, row) => {
            const status = row.ai_analysis_status || 'unanalyzed';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          }, {});

          return { data: statusCounts, error: null };
        });

      if (error) {
        throw error;
      }

      const isHealthy = (queueStats.failed < 10) && (queueStats.active < 50);

      return {
        success: true,
        healthy: isHealthy,
        queue: queueStats,
        database_sample: dbStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error in health check:', error);
      throw new HttpException('Health check failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('queue-status')
  async getQueueStatus() {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        this.aiAnalysisQueue.getWaiting(),
        this.aiAnalysisQueue.getActive(),
        this.aiAnalysisQueue.getCompleted(),
        this.aiAnalysisQueue.getFailed(),
      ]);

      return {
        success: true,
        queue: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
        },
        active_jobs: active.map(job => ({
          id: job.id,
          data: job.data,
          attempts: job.attemptsMade,
          timestamp: job.timestamp,
        })),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error getting queue status:', error);
      throw new HttpException('Failed to get queue status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('retry-failed')
  async retryFailedJobs() {
    try {
      const failedJobs = await this.aiAnalysisQueue.getFailed();
      
      if (failedJobs.length === 0) {
        return {
          success: true,
          message: 'No failed jobs to retry',
          retried: 0,
          timestamp: new Date().toISOString()
        };
      }

      // Retry up to 20 failed jobs
      const jobsToRetry = failedJobs.slice(0, 20);
      
      for (const job of jobsToRetry) {
        await job.retry();
      }

      this.logger.log(`Retried ${jobsToRetry.length} failed AI analysis jobs`);
      
      return {
        success: true,
        message: `Retried ${jobsToRetry.length} failed jobs`,
        retried: jobsToRetry.length,
        total_failed: failedJobs.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error retrying failed jobs:', error);
      throw new HttpException('Failed to retry failed jobs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('cleanup')
  async cleanupJobs() {
    try {
      const [completed, failed] = await Promise.all([
        this.aiAnalysisQueue.getCompleted(),
        this.aiAnalysisQueue.getFailed(),
      ]);

      // Clean up old completed jobs (keep last 100)
      const completedToRemove = completed.slice(0, Math.max(0, completed.length - 100));
      
      // Clean up old failed jobs (keep last 50)
      const failedToRemove = failed.slice(0, Math.max(0, failed.length - 50));
      
      await Promise.all([
        ...completedToRemove.map(job => job.remove()),
        ...failedToRemove.map(job => job.remove()),
      ]);

      this.logger.log(`Cleaned up ${completedToRemove.length} completed and ${failedToRemove.length} failed jobs`);
      
      return {
        success: true,
        message: `Cleaned up ${completedToRemove.length + failedToRemove.length} jobs`,
        cleaned: {
          completed: completedToRemove.length,
          failed: failedToRemove.length,
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error cleaning up jobs:', error);
      throw new HttpException('Failed to cleanup jobs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
} 