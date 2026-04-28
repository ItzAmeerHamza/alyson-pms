import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InsightsService } from '../insights/insights.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
@Processor('unusual-detector')
export class UnusualDetectorProcessor {
  private readonly logger = new Logger(UnusualDetectorProcessor.name);

  constructor(
    private insightsService: InsightsService,
    private notificationsService: NotificationsService,
  ) {}

  @Process('detect-unusual')
  async detectUnusual(job: Job) {
    try {
      this.logger.log('Starting unusual activity detection...');
      
      // Detect unusual activity for all users
      const detections = await this.insightsService.detectUnusualActivity();
      
      if (detections.length === 0) {
        this.logger.log('No unusual activity detected');
        return;
      }

      // Process each detection
      for (const detection of detections) {
        // Save to database
        await this.insightsService.saveUnusualActivity(detection);
        
        // Send notifications
        await this.notificationsService.sendUnusualActivityAlert(detection);
        
        this.logger.log(`Processed unusual activity: ${detection.rule_triggered} for user ${detection.user_id}`);
      }

      this.logger.log(`Processed ${detections.length} unusual activity detections`);
    } catch (error) {
      this.logger.error('Unusual activity detection failed:', error);
      throw error;
    }
  }
} 