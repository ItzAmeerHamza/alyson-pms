import { Injectable, Logger } from '@nestjs/common';
// DISABLED: Using Supabase pg_cron instead of NestJS cron for simplicity
// import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Service to automatically close stale time tracking sessions
 * This acts as a fallback when the desktop agent fails to properly close sessions
 * (e.g., app crash, network failure, force quit)
 * 
 * NOTE: Cron jobs are DISABLED - manual triggers still available.
 * Consider adding a Supabase pg_cron job for stale session cleanup if needed.
 */
@Injectable()
export class StaleSessionCleanupService {
  private readonly logger = new Logger(StaleSessionCleanupService.name);
  private readonly supabase: SupabaseClient;

  // Maximum session duration before auto-close (12 hours)
  private readonly MAX_SESSION_DURATION_HOURS = 12;
  
  // Sessions older than this are considered stale and will be closed (6 hours)
  private readonly STALE_THRESHOLD_HOURS = 6;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
    );
  }

  /**
   * Run every 15 minutes during work hours (Mon-Fri 6AM-10PM UTC)
   * DISABLED: Consider adding Supabase pg_cron job instead
   */
  // @Cron('*/15 6-22 * * 1-5', { timeZone: 'UTC' })
  async cleanupDuringWorkHours() {
    this.logger.log('Running stale session cleanup (work hours)');
    await this.cleanupStaleSessions();
  }

  /**
   * Run every 30 minutes during off hours
   * DISABLED: Consider adding Supabase pg_cron job instead
   */
  // @Cron('*/30 0-5,23 * * 1-5', { timeZone: 'UTC' })
  async cleanupDuringOffHours() {
    this.logger.log('Running stale session cleanup (off hours)');
    await this.cleanupStaleSessions();
  }

  /**
   * Run hourly on weekends
   * DISABLED: Consider adding Supabase pg_cron job instead
   */
  // @Cron(CronExpression.EVERY_HOUR, { timeZone: 'UTC' })
  async cleanupWeekends() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    
    // Only run on weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      this.logger.log('Running stale session cleanup (weekend)');
      await this.cleanupStaleSessions();
    }
  }

  /**
   * Main cleanup logic - finds and closes stale sessions
   */
  async cleanupStaleSessions(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    try {
      const now = new Date();
      const staleThreshold = new Date(now.getTime() - this.STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

      // Find sessions with no end_time that started more than STALE_THRESHOLD_HOURS ago
      const { data: staleSessions, error: fetchError } = await this.supabase
        .from('time_logs')
        .select('id, user_id, start_time, project_id')
        .is('end_time', null)
        .neq('status', 'completed')
        .lt('start_time', staleThreshold.toISOString())
        .order('start_time', { ascending: true });

      if (fetchError) {
        this.logger.error('Error fetching stale sessions:', fetchError);
        return { processed: 0, errors: 1 };
      }

      if (!staleSessions || staleSessions.length === 0) {
        this.logger.log('No stale sessions found');
        return { processed: 0, errors: 0 };
      }

      this.logger.log(`Found ${staleSessions.length} stale sessions to close`);

      // Process each stale session
      for (const session of staleSessions) {
        try {
          const startTime = new Date(session.start_time);
          
          // Calculate end time:
          // - If session is older than MAX_SESSION_DURATION, cap at MAX_SESSION_DURATION from start
          // - Otherwise, use the stale threshold time as the end time
          const maxEndTime = new Date(startTime.getTime() + this.MAX_SESSION_DURATION_HOURS * 60 * 60 * 1000);
          const endTime = maxEndTime < staleThreshold ? maxEndTime : staleThreshold;

          // Update the session with end time and auto_closed status
          const { error: updateError } = await this.supabase
            .from('time_logs')
            .update({
              end_time: endTime.toISOString(),
              status: 'auto_closed'
            })
            .eq('id', session.id);

          if (updateError) {
            this.logger.error(`Error closing session ${session.id}:`, updateError);
            errors++;
          } else {
            processed++;
            this.logger.log(`Auto-closed stale session ${session.id} for user ${session.user_id}`);
          }
        } catch (sessionError) {
          this.logger.error(`Exception processing session ${session.id}:`, sessionError);
          errors++;
        }
      }

      this.logger.log(`Stale session cleanup completed: ${processed} closed, ${errors} errors`);
      return { processed, errors };

    } catch (error) {
      this.logger.error('Error in stale session cleanup:', error);
      return { processed, errors: errors + 1 };
    }
  }

  /**
   * Close sessions from the previous day that were left open
   * Runs at 2 AM to catch any sessions left open from the previous day
   * DISABLED: Consider adding Supabase pg_cron job instead
   */
  // @Cron('0 2 * * *', { timeZone: 'UTC' })
  async closePreviousDaySessions(): Promise<void> {
    this.logger.log('Running previous day session cleanup');

    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

      // Find sessions that started yesterday and are still open
      const { data: yesterdaySessions, error: fetchError } = await this.supabase
        .from('time_logs')
        .select('id, user_id, start_time')
        .is('end_time', null)
        .neq('status', 'completed')
        .gte('start_time', startOfYesterday.toISOString())
        .lt('start_time', startOfToday.toISOString());

      if (fetchError) {
        this.logger.error('Error fetching yesterday sessions:', fetchError);
        return;
      }

      if (!yesterdaySessions || yesterdaySessions.length === 0) {
        this.logger.log('No unclosed sessions from yesterday');
        return;
      }

      this.logger.log(`Found ${yesterdaySessions.length} unclosed sessions from yesterday`);

      for (const session of yesterdaySessions) {
        const startTime = new Date(session.start_time);
        // End at midnight or max duration, whichever is earlier
        const maxEndTime = new Date(startTime.getTime() + this.MAX_SESSION_DURATION_HOURS * 60 * 60 * 1000);
        const endTime = maxEndTime < startOfToday ? maxEndTime : startOfToday;

        const { error: updateError } = await this.supabase
          .from('time_logs')
          .update({
            end_time: endTime.toISOString(),
            status: 'auto_closed'
          })
          .eq('id', session.id);

        if (updateError) {
          this.logger.error(`Error closing yesterday session ${session.id}:`, updateError);
        } else {
          this.logger.log(`Auto-closed yesterday session ${session.id}`);
        }
      }
    } catch (error) {
      this.logger.error('Error in previous day cleanup:', error);
    }
  }

  /**
   * Manual trigger for cleanup (can be called from controller)
   */
  async manualCleanup(): Promise<{ processed: number; errors: number; message: string }> {
    this.logger.log('Manual stale session cleanup triggered');
    const result = await this.cleanupStaleSessions();
    return {
      ...result,
      message: `Cleanup completed: ${result.processed} sessions closed, ${result.errors} errors`
    };
  }

  /**
   * Get statistics about unclosed sessions
   */
  async getUnclosedSessionStats(): Promise<{
    total: number;
    byAge: { lessThan1Hour: number; lessThan6Hours: number; moreThan6Hours: number };
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
      const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

      const { data: unclosedSessions, error } = await this.supabase
        .from('time_logs')
        .select('id, start_time')
        .is('end_time', null)
        .neq('status', 'completed');

      if (error) {
        this.logger.error('Error fetching unclosed session stats:', error);
        return { total: 0, byAge: { lessThan1Hour: 0, lessThan6Hours: 0, moreThan6Hours: 0 } };
      }

      const sessions = unclosedSessions || [];
      const byAge = {
        lessThan1Hour: 0,
        lessThan6Hours: 0,
        moreThan6Hours: 0
      };

      sessions.forEach(session => {
        const startTime = new Date(session.start_time);
        if (startTime > oneHourAgo) {
          byAge.lessThan1Hour++;
        } else if (startTime > sixHoursAgo) {
          byAge.lessThan6Hours++;
        } else {
          byAge.moreThan6Hours++;
        }
      });

      return {
        total: sessions.length,
        byAge
      };
    } catch (error) {
      this.logger.error('Error getting unclosed session stats:', error);
      return { total: 0, byAge: { lessThan1Hour: 0, lessThan6Hours: 0, moreThan6Hours: 0 } };
    }
  }
}

