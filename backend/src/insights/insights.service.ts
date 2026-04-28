import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private supabaseService: SupabaseService) {}

  async detectUnusualActivity(userId?: string, organizationId?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      const now = new Date();
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

      const detections = [];

      // Rule 1: Low activity (< 30% for 30 minutes)
      let lowActivityQuery = supabase
        .from('screenshots')
        .select('user_id, activity_percent, captured_at')
        .lt('activity_percent', 30)
        .gte('captured_at', thirtyMinutesAgo.toISOString());

      if (userId) {
        lowActivityQuery = lowActivityQuery.eq('user_id', userId);
      }
      if (organizationId) {
        lowActivityQuery = lowActivityQuery.eq('organization_id', organizationId);
      }

      const { data: lowActivity } = await lowActivityQuery;

      if (lowActivity && lowActivity.length >= 6) { // 6 screenshots in 30 min = consistent low activity
        detections.push({
          rule_triggered: 'low_activity',
          confidence: 0.8,
          duration_hm: '30m',
          notes: `Low activity detected: ${lowActivity.length} screenshots with <30% activity`,
          user_id: userId || 'multiple',
        });
      }

      // Rule 2: Long session (> 5 hours continuous)
      let longSessionQuery = supabase
        .from('time_logs')
        .select('user_id, started_at, ended_at')
        .gte('started_at', fiveHoursAgo.toISOString())
        .is('ended_at', null);

      if (userId) {
        longSessionQuery = longSessionQuery.eq('user_id', userId);
      }
      if (organizationId) {
        longSessionQuery = longSessionQuery.eq('organization_id', organizationId);
      }

      const { data: longSessions } = await longSessionQuery;

      if (longSessions && longSessions.length > 0) {
        for (const session of longSessions) {
          const sessionDuration = now.getTime() - new Date(session.started_at).getTime();
          if (sessionDuration > 5 * 60 * 60 * 1000) { // 5 hours
            detections.push({
              rule_triggered: 'long_session',
              confidence: 0.9,
              duration_hm: `${Math.round(sessionDuration / (60 * 60 * 1000))}h`,
              notes: `Long session detected: ${Math.round(sessionDuration / (60 * 60 * 1000))} hours continuous`,
              user_id: session.user_id,
            });
          }
        }
      }

      // Rule 3: Activity drop (>50 point drop in activity)
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      let activityDropQuery = supabase
        .from('screenshots')
        .select('user_id, activity_percent, captured_at')
        .gte('captured_at', twoHoursAgo.toISOString())
        .not('activity_percent', 'is', null)
        .order('captured_at', { ascending: true });

      if (userId) {
        activityDropQuery = activityDropQuery.eq('user_id', userId);
      }
      if (organizationId) {
        activityDropQuery = activityDropQuery.eq('organization_id', organizationId);
      }

      const { data: recentActivity } = await activityDropQuery;

      if (recentActivity && recentActivity.length >= 4) {
        const firstHalf = recentActivity.slice(0, Math.floor(recentActivity.length / 2));
        const secondHalf = recentActivity.slice(Math.floor(recentActivity.length / 2));

        const firstAvg = firstHalf.reduce((sum, s) => sum + s.activity_percent, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, s) => sum + s.activity_percent, 0) / secondHalf.length;

        if (firstAvg - secondAvg > 50) {
          detections.push({
            rule_triggered: 'activity_drop',
            confidence: 0.7,
            duration_hm: '2h',
            notes: `Activity drop detected: ${Math.round(firstAvg)}% to ${Math.round(secondAvg)}%`,
            user_id: userId || 'multiple',
          });
        }
      }

      return detections;
    } catch (error) {
      this.logger.error('Failed to detect unusual activity:', error);
      throw error;
    }
  }

  async getUnusualActivityHistory(userId?: string, startDate?: string, endDate?: string, organizationId?: string) {
    try {
      const supabase = this.supabaseService.getClient();

      let query = supabase
        .from('unusual_activity')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      if (startDate) {
        query = query.gte('detected_at', startDate);
      }
      if (endDate) {
        query = query.lte('detected_at', endDate);
      }

      const { data, error } = await query.order('detected_at', { ascending: false });

      if (error) {
        this.logger.error('Failed to get unusual activity history:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to get unusual activity history:', error);
      throw error;
    }
  }

  async saveUnusualActivity(detection: any) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('unusual_activity')
        .insert({
          ...detection,
          detected_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        this.logger.error('Failed to save unusual activity:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to save unusual activity:', error);
      throw error;
    }
  }

  async getProductivityInsights(userId: string, startDate?: string, endDate?: string) {
    try {
      const supabase = this.supabaseService.getClient();

      // Get app usage summary
      let appQuery = supabase
        .from('app_logs')
        .select('app_name, category, duration_seconds')
        .eq('user_id', userId);

      if (startDate) {
        appQuery = appQuery.gte('started_at', startDate);
      }
      if (endDate) {
        appQuery = appQuery.lte('started_at', endDate);
      }

      const { data: appData } = await appQuery;

      // Get URL usage summary
      let urlQuery = supabase
        .from('url_logs')
        .select('site_url, category, duration_seconds')
        .eq('user_id', userId);

      if (startDate) {
        urlQuery = urlQuery.gte('started_at', startDate);
      }
      if (endDate) {
        urlQuery = urlQuery.lte('started_at', endDate);
      }

      const { data: urlData } = await urlQuery;

      // Calculate productivity metrics
      const totalAppTime = appData?.reduce((sum, app) => sum + (app.duration_seconds || 0), 0) || 0;
      const totalUrlTime = urlData?.reduce((sum, url) => sum + (url.duration_seconds || 0), 0) || 0;

      const productiveAppTime = appData?.filter(app => app.category === 'core')
        .reduce((sum, app) => sum + (app.duration_seconds || 0), 0) || 0;
      const productiveUrlTime = urlData?.filter(url => url.category === 'core')
        .reduce((sum, url) => sum + (url.duration_seconds || 0), 0) || 0;

      const productivityScore = totalAppTime + totalUrlTime > 0 
        ? Math.round(((productiveAppTime + productiveUrlTime) / (totalAppTime + totalUrlTime)) * 100)
        : 0;

      return {
        productivity_score: productivityScore,
        total_time_seconds: totalAppTime + totalUrlTime,
        productive_time_seconds: productiveAppTime + productiveUrlTime,
        app_breakdown: this.groupByCategory(appData || []),
        url_breakdown: this.groupByCategory(urlData || []),
      };
    } catch (error) {
      this.logger.error('Failed to get productivity insights:', error);
      throw error;
    }
  }

  // ITEM 9: Domain Categorizer
  async getDomainCategories(date?: string, organizationId?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      let query = supabase
        .from('url_logs')
        .select('domain, COUNT(*) as visit_count')
        .order('visit_count', { ascending: false });

      if (date) {
        query = query.gte('timestamp', `${date}T00:00:00Z`)
                   .lt('timestamp', `${date}T23:59:59Z`);
      }
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Failed to get domain categories:', error);
      throw error;
    }
  }

  async categorizeDomain(domain: string, category: string) {
    try {
      const supabase = this.supabaseService.getClient();
      // This would update a domain_categories table in production
      // For now, we'll just return success
      return { success: true, domain, category };
    } catch (error) {
      this.logger.error('Failed to categorize domain:', error);
      throw error;
    }
  }

  // ITEM 10: Activity Analyzer Job
  async getActivityAnalysis(userId?: string, date?: string, period: 'day' | 'week' | 'month' = 'day') {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('daily_activity_summary')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('activity_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Failed to get activity analysis:', error);
      throw error;
    }
  }

  async getProductivityMetrics(userId?: string, date?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('productivity_metrics')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('activity_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Failed to get productivity metrics:', error);
      throw error;
    }
  }

  // ITEM 11: Unusual Activity Detector
  async getUnusualActivities(userId?: string, date?: string, severity?: 'low' | 'medium' | 'high', organizationId?: string) {
    try {
      const detections = await this.detectUnusualActivity(userId, organizationId);
      
      // Filter by severity if specified
      if (severity) {
        return detections.filter(d => {
          if (severity === 'high') return d.confidence >= 0.8;
          if (severity === 'medium') return d.confidence >= 0.6 && d.confidence < 0.8;
          if (severity === 'low') return d.confidence < 0.6;
          return true;
        });
      }

      return detections;
    } catch (error) {
      this.logger.error('Failed to get unusual activities:', error);
      throw error;
    }
  }

  async markActivityReviewed(activityId: string) {
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('unusual_activity')
        .update({ reviewed: true, reviewed_at: new Date().toISOString() })
        .eq('id', activityId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to mark activity as reviewed:', error);
      throw error;
    }
  }

  // ITEM 12: Notification Pusher
  async getNotifications(userId: string) {
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Failed to get notifications:', error);
      throw error;
    }
  }

  async createNotification(userId: string, type: string, title: string, message: string) {
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          title,
          message,
          read: false
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  async markNotificationRead(notificationId: string) {
    try {
      const supabase = this.supabaseService.getClient();
      const { data, error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  // ITEM 13: Activity Feed
  async getActivityFeed(userId?: string, limit: number = 50, offset: number = 0, organizationId?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      // Combine different activity types
      const activities = [];

      // Get recent app logs
      let appQuery = supabase
        .from('app_logs')
        .select('*, users(full_name)')
        .order('timestamp', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (userId) {
        appQuery = appQuery.eq('user_id', userId);
      }
      if (organizationId) {
        appQuery = appQuery.eq('organization_id', organizationId);
      }

      const { data: appLogs } = await appQuery;
      if (appLogs) {
        activities.push(...appLogs.map(log => ({
          ...log,
          activity_type: 'app_usage',
          timestamp: log.timestamp
        })));
      }

      // Get recent URL logs
      let urlQuery = supabase
        .from('url_logs')
        .select('*, users(full_name)')
        .order('timestamp', { ascending: false })
        .limit(limit)
        .range(offset, offset + limit - 1);

      if (userId) {
        urlQuery = urlQuery.eq('user_id', userId);
      }
      if (organizationId) {
        urlQuery = urlQuery.eq('organization_id', organizationId);
      }

      const { data: urlLogs } = await urlQuery;
      if (urlLogs) {
        activities.push(...urlLogs.map(log => ({
          ...log,
          activity_type: 'url_visit',
          timestamp: log.timestamp
        })));
      }

      // Sort by timestamp and limit
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

    } catch (error) {
      this.logger.error('Failed to get activity feed:', error);
      throw error;
    }
  }

  // Enhanced Analytics Methods
  async getUtilizationGauge(userId?: string, date?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('daily_activity_summary')
        .select('avg_activity_percent, avg_focus_percent');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('activity_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      const avgActivity = data?.reduce((sum, d) => sum + (d.avg_activity_percent || 0), 0) / (data?.length || 1);
      const avgFocus = data?.reduce((sum, d) => sum + (d.avg_focus_percent || 0), 0) / (data?.length || 1);

      return {
        utilization: Math.round((avgActivity + avgFocus) / 2),
        activity: Math.round(avgActivity),
        focus: Math.round(avgFocus)
      };
    } catch (error) {
      this.logger.error('Failed to get utilization gauge:', error);
      throw error;
    }
  }

  async getWorkClassification(userId?: string, date?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('app_usage_analytics')
        .select('app_name, usage_count');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('usage_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Categorize apps (simplified)
      const categories = {
        'Development': ['Visual Studio Code', 'Terminal', 'Git'],
        'Communication': ['Slack', 'Teams', 'Email'],
        'Design': ['Figma', 'Photoshop', 'Sketch'],
        'Productivity': ['Excel', 'Word', 'Notion'],
        'Other': []
      };

      // Calculate category totals based on actual app usage
      const categoryTotals: Record<string, number> = {
        'Development': 0,
        'Communication': 0,
        'Design': 0,
        'Productivity': 0,
        'Other': 0
      };

      if (data && data.length > 0) {
        data.forEach(app => {
          let matched = false;
          for (const [category, apps] of Object.entries(categories)) {
            if (apps.some(a => app.app_name?.toLowerCase().includes(a.toLowerCase()))) {
              categoryTotals[category] += app.usage_count || 0;
              matched = true;
              break;
            }
          }
          if (!matched) {
            categoryTotals['Other'] += app.usage_count || 0;
          }
        });
      }

      const totalUsage = Object.values(categoryTotals).reduce((a, b) => a + b, 0) || 1;
      const totalHours = 8; // Assuming 8-hour workday
      
      const classification = Object.entries(categoryTotals).map(([category, count]) => ({
        category,
        hours: (count / totalUsage) * totalHours,
        percentage: (count / totalUsage) * 100
      }));

      return classification;
    } catch (error) {
      this.logger.error('Failed to get work classification:', error);
      throw error;
    }
  }

  async getFocusDistribution(userId?: string, date?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('screenshots')
        .select('focus_percent');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.gte('captured_at', `${date}T00:00:00Z`)
                   .lt('captured_at', `${date}T23:59:59Z`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Categorize focus levels
      const distribution = [
        { name: 'Deep Focus', value: 0, color: '#10b981' },
        { name: 'Light Focus', value: 0, color: '#f59e0b' },
        { name: 'Distracted', value: 0, color: '#ef4444' },
        { name: 'Idle', value: 0, color: '#6b7280' }
      ];

      data?.forEach(screenshot => {
        const focus = screenshot.focus_percent || 0;
        if (focus >= 80) distribution[0].value++;
        else if (focus >= 60) distribution[1].value++;
        else if (focus >= 30) distribution[2].value++;
        else distribution[3].value++;
      });

      return distribution;
    } catch (error) {
      this.logger.error('Failed to get focus distribution:', error);
      throw error;
    }
  }

  async getAppUsageAnalytics(userId?: string, date?: string, category?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('app_usage_analytics')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('usage_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Failed to get app usage analytics:', error);
      throw error;
    }
  }

  async getUrlUsageAnalytics(userId?: string, date?: string, category?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('url_usage_analytics')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('visit_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Failed to get URL usage analytics:', error);
      throw error;
    }
  }

  async getIdleAnalytics(userId?: string, date?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      let query = supabase
        .from('idle_analytics')
        .select('*');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      if (date) {
        query = query.eq('idle_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data;
    } catch (error) {
      this.logger.error('Failed to get idle analytics:', error);
      throw error;
    }
  }

  async getHourlyDistribution(userId?: string, date?: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      // Get app usage by hour
      let appQuery = supabase
        .from('app_usage_analytics')
        .select('usage_hour, usage_count');
      
      if (userId) {
        appQuery = appQuery.eq('user_id', userId);
      }
      if (date) {
        appQuery = appQuery.eq('usage_date', date);
      }

      const { data: appData, error: appError } = await appQuery;
      if (appError) throw appError;

      // Get URL usage by hour
      let urlQuery = supabase
        .from('url_usage_analytics')
        .select('visit_hour, visit_count');
      
      if (userId) {
        urlQuery = urlQuery.eq('user_id', userId);
      }
      if (date) {
        urlQuery = urlQuery.eq('visit_date', date);
      }

      const { data: urlData, error: urlError } = await urlQuery;
      if (urlError) throw urlError;

      // Get idle time by hour (if we have the data)
      let idleQuery = supabase
        .from('idle_analytics')
        .select('total_idle_seconds');
      
      if (userId) {
        idleQuery = idleQuery.eq('user_id', userId);
      }
      if (date) {
        idleQuery = idleQuery.eq('idle_date', date);
      }

      const { data: idleData, error: idleError } = await idleQuery;
      // Don't throw on idle error, it's optional data

      // Aggregate data by hour
      const hourlyData: Record<number, { apps: number; urls: number; idle: number }> = {};
      
      // Initialize hours 9-17 (9am to 5pm)
      for (let hour = 9; hour <= 17; hour++) {
        hourlyData[hour] = { apps: 0, urls: 0, idle: 0 };
      }

      // Sum app usage by hour
      appData?.forEach(item => {
        const hour = item.usage_hour;
        if (hour >= 9 && hour <= 17 && hourlyData[hour]) {
          hourlyData[hour].apps += item.usage_count || 0;
        }
      });

      // Sum URL visits by hour
      urlData?.forEach(item => {
        const hour = item.visit_hour;
        if (hour >= 9 && hour <= 17 && hourlyData[hour]) {
          hourlyData[hour].urls += item.visit_count || 0;
        }
      });

      // Add idle time if available (distribute evenly across hours for now)
      if (idleData && idleData.length > 0 && !idleError) {
        const totalIdleSeconds = idleData.reduce((sum, item) => sum + (item.total_idle_seconds || 0), 0);
        const idlePerHour = totalIdleSeconds / 9 / 60; // Convert to minutes per hour
        Object.keys(hourlyData).forEach(hour => {
          hourlyData[Number(hour)].idle = Math.round(idlePerHour);
        });
      }

      // Convert to array format
      const hours = Object.entries(hourlyData)
        .map(([hour, data]) => ({
          hour: `${hour.toString().padStart(2, '0')}:00`,
          apps: data.apps,
          urls: data.urls,
          idle: data.idle
        }))
        .sort((a, b) => a.hour.localeCompare(b.hour));

      return hours;
    } catch (error) {
      this.logger.error('Failed to get hourly distribution:', error);
      throw error;
    }
  }

  async getDashboardWidgets(userId?: string, date?: string) {
    try {
      const [utilization, workClassification, focusDistribution] = await Promise.all([
        this.getUtilizationGauge(userId, date),
        this.getWorkClassification(userId, date),
        this.getFocusDistribution(userId, date)
      ]);

      return {
        utilization,
        workClassification,
        focusDistribution
      };
    } catch (error) {
      this.logger.error('Failed to get dashboard widgets:', error);
      throw error;
    }
  }

  // Export Methods
  async exportAppUsage(userId?: string, date?: string, format: 'csv' | 'json' = 'csv') {
    try {
      const data = await this.getAppUsageAnalytics(userId, date);
      
      if (format === 'csv') {
        const csv = this.convertToCSV(data);
        return { data: csv, contentType: 'text/csv' };
      }
      
      return { data: JSON.stringify(data, null, 2), contentType: 'application/json' };
    } catch (error) {
      this.logger.error('Failed to export app usage:', error);
      throw error;
    }
  }

  async exportUrlUsage(userId?: string, date?: string, format: 'csv' | 'json' = 'csv') {
    try {
      const data = await this.getUrlUsageAnalytics(userId, date);
      
      if (format === 'csv') {
        const csv = this.convertToCSV(data);
        return { data: csv, contentType: 'text/csv' };
      }
      
      return { data: JSON.stringify(data, null, 2), contentType: 'application/json' };
    } catch (error) {
      this.logger.error('Failed to export URL usage:', error);
      throw error;
    }
  }

  async exportIdleTime(userId?: string, date?: string, format: 'csv' | 'json' = 'csv') {
    try {
      const data = await this.getIdleAnalytics(userId, date);
      
      if (format === 'csv') {
        const csv = this.convertToCSV(data);
        return { data: csv, contentType: 'text/csv' };
      }
      
      return { data: JSON.stringify(data, null, 2), contentType: 'application/json' };
    } catch (error) {
      this.logger.error('Failed to export idle time:', error);
      throw error;
    }
  }

  private convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        const value = row[header];
        return typeof value === 'string' ? `"${value}"` : value;
      }).join(','))
    ];
    
    return csvRows.join('\n');
  }

  private groupByCategory(data: any[]) {
    return data.reduce((acc, item) => {
      const category = item.category || 'uncategorized';
      if (!acc[category]) {
        acc[category] = {
          category,
          total_duration_seconds: 0,
          total_duration_hours: 0,
        };
      }
      acc[category].total_duration_seconds += item.duration_seconds || 0;
      acc[category].total_duration_hours = Math.round(acc[category].total_duration_seconds / 3600 * 100) / 100;
      return acc;
    }, {});
  }
} 