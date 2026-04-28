import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';

@Injectable()
export class WorkersService {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    @InjectQueue('activity-analyzer') private activityQueue: Queue,
    @InjectQueue('unusual-detector') private detectorQueue: Queue,
    @InjectQueue('notification-pusher') private notificationQueue: Queue,
  ) {}

  async scheduleActivityAnalysis() {
    try {
      await this.activityQueue.add(
        'analyze-activity',
        {},
        {
          repeat: { pattern: '*/5 * * * *' }, // Every 5 minutes
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );
      this.logger.log('Activity analysis job scheduled');
    } catch (error) {
      this.logger.error('Failed to schedule activity analysis:', error);
    }
  }

  async scheduleUnusualDetection() {
    try {
      await this.detectorQueue.add(
        'detect-unusual',
        {},
        {
          repeat: { pattern: '*/10 * * * *' }, // Every 10 minutes
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );
      this.logger.log('Unusual detection job scheduled');
    } catch (error) {
      this.logger.error('Failed to schedule unusual detection:', error);
    }
  }

  async scheduleNotificationPusher() {
    try {
      await this.notificationQueue.add(
        'push-notifications',
        {},
        {
          repeat: { pattern: '* * * * *' }, // Every minute
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      );
      this.logger.log('Notification pusher job scheduled');
    } catch (error) {
      this.logger.error('Failed to schedule notification pusher:', error);
    }
  }

  async initializeJobs() {
    await this.scheduleActivityAnalysis();
    await this.scheduleUnusualDetection();
    await this.scheduleNotificationPusher();
    this.logger.log('All background jobs initialized');
  }
} 