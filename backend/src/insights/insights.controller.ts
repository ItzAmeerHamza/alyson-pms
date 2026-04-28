import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  Post,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
@UseGuards(AuthGuard, RolesGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('unusual-activity')
  @ApiOperation({ summary: 'Detect unusual activity patterns' })
  @Roles('admin', 'manager')
  async detectUnusualActivity(@Query('user_id') userId?: string) {
    return this.insightsService.detectUnusualActivity(userId);
  }

  @Get('unusual-activity/history')
  @ApiOperation({ summary: 'Get unusual activity history' })
  async getUnusualActivityHistory(
    @Request() req,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('user_id') userId?: string,
  ) {
    // Admins and managers can view other users' data
    const targetUserId = 
      (req.user.role === 'admin' || req.user.role === 'manager') && userId 
        ? userId 
        : req.user.id;

    return this.insightsService.getUnusualActivityHistory(targetUserId, startDate, endDate);
  }

  @Get('productivity')
  @ApiOperation({ summary: 'Get productivity insights' })
  async getProductivityInsights(
    @Request() req,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('user_id') userId?: string,
  ) {
    // Admins and managers can view other users' data
    const targetUserId = 
      (req.user.role === 'admin' || req.user.role === 'manager') && userId 
        ? userId 
        : req.user.id;

    return this.insightsService.getProductivityInsights(targetUserId, startDate, endDate);
  }

  // ITEM 9: Domain Categorizer
  @Get('domain-categories')
  @Roles('admin', 'manager')
  async getDomainCategories(@Query('date') date?: string) {
    return this.insightsService.getDomainCategories(date);
  }

  @Post('categorize-domain')
  @Roles('admin', 'manager')
  async categorizeDomain(@Body() body: { domain: string; category: string }) {
    return this.insightsService.categorizeDomain(body.domain, body.category);
  }

  // ITEM 10: Activity Analyzer Job
  @Get('activity-analysis')
  @Roles('admin', 'manager')
  async getActivityAnalysis(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('period') period: 'day' | 'week' | 'month' = 'day'
  ) {
    return this.insightsService.getActivityAnalysis(userId, date, period);
  }

  @Get('productivity-metrics')
  @Roles('admin', 'manager')
  async getProductivityMetrics(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getProductivityMetrics(userId, date);
  }

  // ITEM 11: Unusual Activity Detector
  @Get('unusual-activities')
  @Roles('admin', 'manager')
  async getUnusualActivities(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('severity') severity?: 'low' | 'medium' | 'high'
  ) {
    return this.insightsService.getUnusualActivities(userId, date, severity);
  }

  @Post('mark-activity-reviewed')
  @Roles('admin', 'manager')
  async markActivityReviewed(@Body() body: { activityId: string }) {
    return this.insightsService.markActivityReviewed(body.activityId);
  }

  // ITEM 12: Notification Pusher
  @Get('notifications')
  async getNotifications(@Query('userId') userId: string) {
    return this.insightsService.getNotifications(userId);
  }

  @Post('notifications')
  @Roles('admin', 'manager')
  async createNotification(@Body() body: {
    userId: string;
    type: string;
    title: string;
    message: string;
  }) {
    return this.insightsService.createNotification(
      body.userId,
      body.type,
      body.title,
      body.message
    );
  }

  @Post('notifications/mark-read')
  async markNotificationRead(@Body() body: { notificationId: string }) {
    return this.insightsService.markNotificationRead(body.notificationId);
  }

  // ITEM 13: GraphQL Feed (REST equivalent)
  @Get('activity-feed')
  @Roles('admin', 'manager')
  async getActivityFeed(
    @Query('userId') userId?: string,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0
  ) {
    return this.insightsService.getActivityFeed(userId, limit, offset);
  }

  // Enhanced Analytics Endpoints
  @Get('utilization-gauge')
  @Roles('admin', 'manager')
  async getUtilizationGauge(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getUtilizationGauge(userId, date);
  }

  @Get('work-classification')
  @Roles('admin', 'manager')
  async getWorkClassification(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getWorkClassification(userId, date);
  }

  @Get('focus-distribution')
  @Roles('admin', 'manager')
  async getFocusDistribution(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getFocusDistribution(userId, date);
  }

  @Get('app-usage-analytics')
  @Roles('admin', 'manager')
  async getAppUsageAnalytics(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('category') category?: string
  ) {
    return this.insightsService.getAppUsageAnalytics(userId, date, category);
  }

  @Get('url-usage-analytics')
  @Roles('admin', 'manager')
  async getUrlUsageAnalytics(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('category') category?: string
  ) {
    return this.insightsService.getUrlUsageAnalytics(userId, date, category);
  }

  @Get('idle-analytics')
  @Roles('admin', 'manager')
  async getIdleAnalytics(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getIdleAnalytics(userId, date);
  }

  @Get('hourly-distribution')
  @Roles('admin', 'manager')
  async getHourlyDistribution(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getHourlyDistribution(userId, date);
  }

  // Dashboard Widgets
  @Get('dashboard-widgets')
  @Roles('admin', 'manager')
  async getDashboardWidgets(
    @Query('userId') userId?: string,
    @Query('date') date?: string
  ) {
    return this.insightsService.getDashboardWidgets(userId, date);
  }

  // Export functionality
  @Get('export/app-usage')
  @Roles('admin', 'manager')
  async exportAppUsage(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('format') format: 'csv' | 'json' = 'csv'
  ) {
    return this.insightsService.exportAppUsage(userId, date, format);
  }

  @Get('export/url-usage')
  @Roles('admin', 'manager')
  async exportUrlUsage(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('format') format: 'csv' | 'json' = 'csv'
  ) {
    return this.insightsService.exportUrlUsage(userId, date, format);
  }

  @Get('export/idle-time')
  @Roles('admin', 'manager')
  async exportIdleTime(
    @Query('userId') userId?: string,
    @Query('date') date?: string,
    @Query('format') format: 'csv' | 'json' = 'csv'
  ) {
    return this.insightsService.exportIdleTime(userId, date, format);
  }
} 