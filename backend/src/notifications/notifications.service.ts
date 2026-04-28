import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IncomingWebhook } from '@slack/webhook';
import * as nodemailer from 'nodemailer';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private slackWebhook: IncomingWebhook;
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @Optional() private configService?: ConfigService,
    private supabaseService?: SupabaseService,
  ) {
    // Initialize Slack webhook (optional)
    const slackUrl = this.configService?.get<string>('SLACK_WEBHOOK_URL') || process.env.SLACK_WEBHOOK_URL;
    if (slackUrl) {
      this.slackWebhook = new IncomingWebhook(slackUrl);
    } else {
      this.logger.warn('SLACK_WEBHOOK_URL not configured; Slack notifications disabled');
    }

    // Initialize email transporter (optional)
    const smtpHost = this.configService?.get<string>('SMTP_HOST') || process.env.SMTP_HOST;
    const smtpPort = parseInt(this.configService?.get<string>('SMTP_PORT') || process.env.SMTP_PORT || '587');
    const smtpUser = this.configService?.get<string>('SMTP_USER') || process.env.SMTP_USER;
    const smtpPass = this.configService?.get<string>('SMTP_PASSWORD') || process.env.SMTP_PASSWORD;

    if (smtpHost && smtpUser && smtpPass) {
      this.emailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: false,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else {
      this.logger.warn('SMTP not fully configured; email notifications disabled in this environment');
    }
  }

  async sendSlackNotification(message: string, channel?: string) {
    try {
      if (!this.slackWebhook) {
        this.logger.warn('Slack webhook not configured');
        return false;
      }

      await this.slackWebhook.send({
        text: message,
        channel,
      });

      this.logger.log('Slack notification sent successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to send Slack notification:', error);
      return false;
    }
  }

  async sendEmailNotification(to: string, subject: string, text: string, html?: string) {
    try {
      const mailOptions = {
        from: this.configService.get<string>('SMTP_FROM'),
        to,
        subject,
        text,
        html,
      };

      if (!this.emailTransporter) {
        this.logger.warn('Email transporter not configured; skipping email send');
        return false;
      }
      await this.emailTransporter.sendMail(mailOptions);
      this.logger.log(`Email notification sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to send email notification:', error);
      return false;
    }
  }

  async createNotification(userId: string, type: string, payload: any, organizationId?: string) {
    try {
      // Resolve organization_id if not provided
      let orgId = organizationId;
      if (!orgId) {
        const { data: userData } = await this.supabaseService
          .getClient()
          .from('users')
          .select('organization_id')
          .eq('id', userId)
          .single();
        orgId = userData?.organization_id;
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          payload,
          delivered_via: [],
          organization_id: orgId || null,
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to create notification:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  async getNotifications(userId: string, unreadOnly = false) {
    try {
      let query = this.supabaseService
        .getClient()
        .from('notifications')
        .select('*')
        .eq('user_id', userId);

      if (unreadOnly) {
        query = query.is('read_at', null);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        this.logger.error('Failed to get notifications:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to get notifications:', error);
      throw error;
    }
  }

  async markAsRead(notificationId: string, userId: string) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to mark notification as read:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  async updateDeliveryStatus(notificationId: string, channel: string) {
    try {
      // Get current notification
      const { data: notification } = await this.supabaseService
        .getClient()
        .from('notifications')
        .select('delivered_via')
        .eq('id', notificationId)
        .single();

      if (!notification) {
        throw new Error('Notification not found');
      }

      const deliveredVia = notification.delivered_via || [];
      if (!deliveredVia.includes(channel)) {
        deliveredVia.push(channel);
      }

      const { data, error } = await this.supabaseService
        .getClient()
        .from('notifications')
        .update({ delivered_via: deliveredVia })
        .eq('id', notificationId)
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to update delivery status:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to update delivery status:', error);
      throw error;
    }
  }

  async sendUnusualActivityAlert(detection: any) {
    try {
      // Create notification record
      const notification = await this.createNotification(
        detection.user_id,
        'unusual_activity',
        detection,
      );

      // Send Slack notification
      const slackMessage = `🚨 Unusual Activity Detected\n` +
        `User: ${detection.user_id}\n` +
        `Rule: ${detection.rule_triggered}\n` +
        `Duration: ${detection.duration_hm}\n` +
        `Notes: ${detection.notes}\n` +
        `Confidence: ${Math.round(detection.confidence * 100)}%`;

      const slackSent = await this.sendSlackNotification(slackMessage);
      if (slackSent) {
        await this.updateDeliveryStatus(notification.id, 'slack');
      }

      // Get user email for email notification
      const { data: user } = await this.supabaseService
        .getClient()
        .from('users')
        .select('email')
        .eq('id', detection.user_id)
        .single();

      if (user?.email) {
        const emailSent = await this.sendEmailNotification(
          user.email,
          'Unusual Activity Detected',
          `Unusual activity has been detected in your account.\n\n${detection.notes}`,
        );

        if (emailSent) {
          await this.updateDeliveryStatus(notification.id, 'email');
        }
      }

      return notification;
    } catch (error) {
      this.logger.error('Failed to send unusual activity alert:', error);
      throw error;
    }
  }
} 