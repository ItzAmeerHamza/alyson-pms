import { Controller, Post, Get, UseGuards } from '@nestjs/common';
import { AutomatedReportsService } from './automated-reports.service';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller('reports')
@UseGuards(ApiKeyGuard)
export class ReportsController {
  constructor(private readonly reportsService: AutomatedReportsService) {}

  @Post('test-daily')
  async testDailyReport() {
    try {
      console.log('🧪 Testing daily report generation...');
      await this.reportsService.sendDailyReport();
      return { 
        success: true, 
        message: 'Daily report generated and sent successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Daily report test failed:', error);
      return { 
        success: false, 
        message: 'Failed to generate daily report',
      };
    }
  }

  @Post('test-weekly')
  async testWeeklyReport() {
    try {
      console.log('🧪 Testing weekly report generation...');
      await this.reportsService.sendWeeklyReport();
      return { 
        success: true, 
        message: 'Weekly report generated and sent successfully',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Weekly report test failed:', error);
      return { 
        success: false, 
        message: 'Failed to generate weekly report',
      };
    }
  }

  @Get('status')
  getReportsStatus() {
    return {
      status: 'Reports system active',
      timestamp: new Date().toISOString(),
      endpoints: {
        testDaily: 'POST /reports/test-daily',
        testWeekly: 'POST /reports/test-weekly'
      },
      schedule: {
        daily: 'Every day at 7 PM (19:00)',
        weekly: 'Every Monday at 9 AM'
      }
    };
  }
} 