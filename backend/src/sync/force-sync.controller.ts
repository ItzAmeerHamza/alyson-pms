import { Controller, Post, Body, HttpStatus, HttpException, Logger, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createClient } from '@supabase/supabase-js';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller('sync')
@UseGuards(ApiKeyGuard)
@Throttle({ default: { ttl: 60000, limit: 30 } })
export class ForceSyncController {
  private readonly logger = new Logger(ForceSyncController.name);
  private readonly supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, // Use service role for forced inserts
  );

  @Post('force-url-insert')
  async forceUrlInsert(@Body() urlLog: any) {
    try {
      this.logger.log(`Force inserting URL: ${urlLog.domain} (${urlLog.browser})`);
      
      // Validate required fields
      if (!urlLog.user_id || !urlLog.time_log_id || !urlLog.site_url) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      // Resolve organization_id from user if not provided
      let orgId = urlLog.organization_id;
      if (!orgId) {
        const { data: userData } = await this.supabase
          .from('users')
          .select('organization_id')
          .eq('id', urlLog.user_id)
          .single();
        orgId = userData?.organization_id;
      }

      // Prepare the URL log for insertion
      const urlPayload = {
        user_id: urlLog.user_id,
        time_log_id: urlLog.time_log_id,
        site_url: urlLog.site_url,
        url: urlLog.site_url, // Duplicate for compatibility
        title: urlLog.title || 'Untitled',
        domain: urlLog.domain,
        browser: urlLog.browser,
        timestamp: urlLog.timestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organization_id: orgId || null
      };

      // Insert into database
      const { data, error } = await this.supabase
        .from('url_logs')
        .insert(urlPayload)
        .select('id')
        .single();

      if (error) {
        this.logger.error('Database insertion failed:', error);
        throw new HttpException('Database insertion failed', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.log(`Successfully inserted URL with ID: ${data.id}`);
      
      return {
        success: true,
        message: 'URL inserted successfully',
        id: data.id,
        url: urlPayload.site_url,
        domain: urlPayload.domain
      };

    } catch (error) {
      this.logger.error('Error in force URL insert:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to insert URL', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('force-app-insert')
  async forceAppInsert(@Body() appLog: any) {
    try {
      this.logger.log(`Force inserting App: ${appLog.app_name}`);
      
      // Validate required fields
      if (!appLog.user_id || !appLog.time_log_id || !appLog.app_name) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      // Resolve organization_id from user if not provided
      let orgId = appLog.organization_id;
      if (!orgId) {
        const { data: userData } = await this.supabase
          .from('users')
          .select('organization_id')
          .eq('id', appLog.user_id)
          .single();
        orgId = userData?.organization_id;
      }

      // Prepare the app log for insertion
      const appPayload = {
        user_id: appLog.user_id,
        time_log_id: appLog.time_log_id,
        app_name: appLog.app_name,
        window_title: appLog.window_title || 'Unknown',
        app_path: appLog.app_path,
        timestamp: appLog.timestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        organization_id: orgId || null
      };

      // Insert into database
      const { data, error } = await this.supabase
        .from('app_logs')
        .insert(appPayload)
        .select('id')
        .single();

      if (error) {
        this.logger.error('Database insertion failed:', error);
        throw new HttpException('Database insertion failed', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      this.logger.log(`Successfully inserted App with ID: ${data.id}`);
      
      return {
        success: true,
        message: 'App inserted successfully',
        id: data.id,
        app_name: appPayload.app_name,
        window_title: appPayload.window_title
      };

    } catch (error) {
      this.logger.error('Error in force App insert:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to insert App', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('check-connectivity')
  async checkDatabaseConnectivity() {
    try {
      this.logger.log('Testing database connectivity...');
      
      // Test basic connectivity
      const { data, error } = await this.supabase
        .from('users')
        .select('id')
        .limit(1);

      if (error) {
        throw new HttpException('Database connectivity check failed', HttpStatus.SERVICE_UNAVAILABLE);
      }

      // Test URL logs table
      const { data: urlTest, error: urlError } = await this.supabase
        .from('url_logs')
        .select('id')
        .limit(1);

      // Test app logs table  
      const { data: appTest, error: appError } = await this.supabase
        .from('app_logs')
        .select('id')
        .limit(1);

      this.logger.log('✅ Database connectivity test passed');
      
      return {
        success: true,
        message: 'Database connectivity successful',
        tables: {
          users: !error,
          url_logs: !urlError,
          app_logs: !appError
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Database connectivity test failed:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Database connectivity failed', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  @Post('sync-queue-stats')
  async getSyncQueueStats() {
    try {
      // Get recent stats from various tables to understand sync status
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      // Check recent URL logs
      const { data: recentUrls, error: urlError } = await this.supabase
        .from('url_logs')
        .select('id, timestamp, domain')
        .gte('timestamp', oneHourAgo.toISOString())
        .order('timestamp', { ascending: false })
        .limit(10);

      // Check recent app logs
      const { data: recentApps, error: appError } = await this.supabase
        .from('app_logs')
        .select('id, timestamp, app_name')
        .gte('timestamp', oneHourAgo.toISOString())
        .order('timestamp', { ascending: false })
        .limit(10);

      return {
        success: true,
        recentActivity: {
          urls: {
            count: recentUrls?.length || 0,
            latest: recentUrls?.[0] || null,
            error: urlError?.message || null
          },
          apps: {
            count: recentApps?.length || 0,
            latest: recentApps?.[0] || null,
            error: appError?.message || null
          }
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error getting sync queue stats:', error);
      throw new HttpException('Failed to get sync stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
