import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
@Processor('notification-pusher')
export class NotificationPusherProcessor {
  private readonly logger = new Logger(NotificationPusherProcessor.name);

  constructor(
    private supabaseService: SupabaseService,
    private notificationsService: NotificationsService,
  ) {}

  @Process('push-notifications')
  async pushNotifications(job: Job) {
    try {
      this.logger.log('Starting notification push...');
      const supabase = this.supabaseService.getClient();
      
      // Get undelivered notifications from the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .gte('created_at', oneHourAgo.toISOString())
        .or('delivered_via.is.null,delivered_via.eq.{}')
        .order('created_at', { ascending: true })
        .limit(50); // Process max 50 notifications per run

      if (!notifications || notifications.length === 0) {
        this.logger.log('No pending notifications to push');
        return;
      }

      for (const notification of notifications) {
        await this.processNotification(notification);
      }

      this.logger.log(`Processed ${notifications.length} notifications`);
    } catch (error) {
      this.logger.error('Notification push failed:', error);
      throw error;
    }
  }

  private async processNotification(notification: any) {
    try {
      const deliveredVia = notification.delivered_via || [];
      
      // Send Slack notification if not already sent
      if (!deliveredVia.includes('slack')) {
        const slackMessage = this.formatSlackMessage(notification);
        const slackSent = await this.notificationsService.sendSlackNotification(slackMessage);
        
        if (slackSent) {
          await this.notificationsService.updateDeliveryStatus(notification.id, 'slack');
          this.logger.log(`Slack notification sent for ${notification.id}`);
        }
      }

      // Send email notification if not already sent
      if (!deliveredVia.includes('email')) {
        const emailSent = await this.sendEmailForNotification(notification);
        
        if (emailSent) {
          await this.notificationsService.updateDeliveryStatus(notification.id, 'email');
          this.logger.log(`Email notification sent for ${notification.id}`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to process notification ${notification.id}:`, error);
    }
  }

  private formatSlackMessage(notification: any): string {
    switch (notification.type) {
      case 'unusual_activity':
        const payload = notification.payload;
        return `🚨 Unusual Activity Detected\n` +
          `User: ${payload.user_id}\n` +
          `Rule: ${payload.rule_triggered}\n` +
          `Duration: ${payload.duration_hm}\n` +
          `Notes: ${payload.notes}\n` +
          `Confidence: ${Math.round(payload.confidence * 100)}%`;
      
      case 'low_activity':
        return `⚠️ Low Activity Alert\n` +
          `User: ${notification.user_id}\n` +
          `Details: ${JSON.stringify(notification.payload)}`;
      
      default:
        return `📢 Notification\n` +
          `Type: ${notification.type}\n` +
          `User: ${notification.user_id}\n` +
          `Details: ${JSON.stringify(notification.payload)}`;
    }
  }

  private async sendEmailForNotification(notification: any): Promise<boolean> {
    try {
      // Get user email
      const { data: user } = await this.supabaseService
        .getClient()
        .from('users')
        .select('email')
        .eq('id', notification.user_id)
        .single();

      if (!user?.email) {
        this.logger.warn(`No email found for user ${notification.user_id}`);
        return false;
      }

      const { subject, text } = this.formatEmailContent(notification);
      
      return await this.notificationsService.sendEmailNotification(
        user.email,
        subject,
        text,
      );
    } catch (error) {
      this.logger.error('Failed to send email notification:', error);
      return false;
    }
  }

  private formatEmailContent(notification: any): { subject: string; text: string } {
    switch (notification.type) {
      case 'unusual_activity':
        const payload = notification.payload;
        return {
          subject: 'Unusual Activity Detected',
          text: `Unusual activity has been detected in your account.\n\n` +
            `Rule triggered: ${payload.rule_triggered}\n` +
            `Duration: ${payload.duration_hm}\n` +
            `Details: ${payload.notes}\n` +
            `Confidence: ${Math.round(payload.confidence * 100)}%\n\n` +
            `Please review your recent activity.`,
        };
      
      case 'low_activity':
        return {
          subject: 'Low Activity Alert',
          text: `Low activity has been detected in your account.\n\n` +
            `Please check your time tracking status.`,
        };
      
      default:
        return {
          subject: 'Time Flow Notification',
          text: `You have a new notification from Time Flow.\n\n` +
            `Type: ${notification.type}\n` +
            `Details: ${JSON.stringify(notification.payload)}`,
        };
    }
  }
} 