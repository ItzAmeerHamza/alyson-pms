import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
@Processor('activity-analyzer')
export class ActivityAnalyzerProcessor {
  private readonly logger = new Logger(ActivityAnalyzerProcessor.name);

  constructor(private supabaseService: SupabaseService) {}

  @Process('analyze-activity')
  async analyzeActivity(job: Job) {
    try {
      this.logger.log('Starting activity analysis...');
      const supabase = this.supabaseService.getClient();
      
      // Get screenshots from the last 10 minutes that don't have activity_percent
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      
      const { data: screenshots } = await supabase
        .from('screenshots')
        .select('id, user_id, captured_at')
        .is('activity_percent', null)
        .gte('captured_at', tenMinutesAgo.toISOString())
        .order('captured_at', { ascending: false });

      if (!screenshots || screenshots.length === 0) {
        this.logger.log('No screenshots to analyze');
        return;
      }

      for (const screenshot of screenshots) {
        await this.calculateActivityForScreenshot(screenshot);
      }

      this.logger.log(`Analyzed activity for ${screenshots.length} screenshots`);
    } catch (error) {
      this.logger.error('Activity analysis failed:', error);
      throw error;
    }
  }

  private async calculateActivityForScreenshot(screenshot: any) {
    try {
      const supabase = this.supabaseService.getClient();
      const capturedAt = new Date(screenshot.captured_at);
      const windowStart = new Date(capturedAt.getTime() - 2 * 60 * 1000); // 2 minutes before
      const windowEnd = new Date(capturedAt.getTime() + 2 * 60 * 1000); // 2 minutes after

      // Get app logs in the time window
      const { data: appLogs } = await supabase
        .from('app_logs')
        .select('app_name, duration_seconds, category')
        .eq('user_id', screenshot.user_id)
        .gte('started_at', windowStart.toISOString())
        .lte('ended_at', windowEnd.toISOString());

      // Get URL logs in the time window
      const { data: urlLogs } = await supabase
        .from('url_logs')
        .select('site_url, duration_seconds, category')
        .eq('user_id', screenshot.user_id)
        .gte('started_at', windowStart.toISOString())
        .lte('ended_at', windowEnd.toISOString());

      // Calculate activity metrics
      const totalAppTime = appLogs?.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) || 0;
      const totalUrlTime = urlLogs?.reduce((sum, log) => sum + (log.duration_seconds || 0), 0) || 0;
      const totalTime = totalAppTime + totalUrlTime;

      // Calculate activity percentage (based on total activity in 4-minute window)
      const maxPossibleTime = 4 * 60; // 4 minutes in seconds
      const activityPercent = totalTime > 0 ? Math.min(Math.round((totalTime / maxPossibleTime) * 100), 100) : 0;

      // Calculate focus percentage (based on productive vs non-productive time)
      const productiveAppTime = appLogs?.filter(log => log.category === 'core')
        .reduce((sum, log) => sum + (log.duration_seconds || 0), 0) || 0;
      const productiveUrlTime = urlLogs?.filter(log => log.category === 'core')
        .reduce((sum, log) => sum + (log.duration_seconds || 0), 0) || 0;
      const productiveTime = productiveAppTime + productiveUrlTime;
      
      const focusPercent = totalTime > 0 ? Math.round((productiveTime / totalTime) * 100) : 0;

      // Determine classification
      let classification = 'unproductive';
      if (focusPercent >= 70) {
        classification = 'core';
      } else if (focusPercent >= 30) {
        classification = 'non_core';
      }

      // Update screenshot with calculated metrics
      await supabase
        .from('screenshots')
        .update({
          activity_percent: activityPercent,
          focus_percent: focusPercent,
          classification,
        })
        .eq('id', screenshot.id);

      this.logger.debug(`Updated screenshot ${screenshot.id}: activity=${activityPercent}%, focus=${focusPercent}%, class=${classification}`);
    } catch (error) {
      this.logger.error(`Failed to calculate activity for screenshot ${screenshot.id}:`, error);
    }
  }
} 