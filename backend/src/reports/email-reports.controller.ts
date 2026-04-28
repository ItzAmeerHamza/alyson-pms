import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmailReportsService } from './email-reports.service';
import { SupabaseService } from '../common/supabase.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

export interface CreateReportConfigDto {
  name: string;
  description?: string;
  report_type_id: string;
  schedule_cron?: string;
  schedule_description?: string;
  subject_template: string;
  include_summary?: boolean;
  include_employee_details?: boolean;
  include_alerts?: boolean;
  include_projects?: boolean;
  alert_settings?: any;
  filters?: any;
  recipients: string[]; // Array of user IDs or emails
  organization_id?: string;
}

export interface UpdateReportConfigDto {
  name?: string;
  description?: string;
  schedule_cron?: string;
  schedule_description?: string;
  subject_template?: string;
  include_summary?: boolean;
  include_employee_details?: boolean;
  include_alerts?: boolean;
  include_projects?: boolean;
  alert_settings?: any;
  filters?: any;
  is_active?: boolean;
  recipients?: string[];
  organization_id?: string;
}

@Controller('api/email-reports')
@UseGuards(AuthGuard, RolesGuard)
export class EmailReportsController {
  constructor(
    private emailReportsService: EmailReportsService,
    private supabaseService: SupabaseService,
  ) {}

  // Get all report types
  @Get('types')
  @Roles('admin')
  async getReportTypes() {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase
      .from('report_types')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      throw new Error('Failed to fetch report types');
    }

    return { success: true, data };
  }

  // Get all report configurations
  @Get('configurations')
  @Roles('admin')
  async getReportConfigurations(@Query('organization_id') organizationId?: string) {
    const supabase = this.supabaseService.getClient();
    
    let query = supabase
      .from('report_configurations')
      .select(`
        *,
        report_types (name, template_type),
        report_recipients (
          id,
          email,
          user_id,
          users (full_name)
        )
      `)
      .order('created_at', { ascending: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error('Failed to fetch report configurations');
    }

    return { success: true, data };
  }

  // Get a specific report configuration
  @Get('configurations/:id')
  @Roles('admin')
  async getReportConfiguration(@Param('id') id: string) {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase
      .from('report_configurations')
      .select(`
        *,
        report_types (name, template_type),
        report_recipients (
          id,
          email,
          user_id,
          users (full_name)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      throw new Error('Failed to fetch report configuration');
    }

    return { success: true, data };
  }

  // Create a new report configuration
  @Post('configurations')
  @Roles('admin')
  async createReportConfiguration(@Body() dto: CreateReportConfigDto) {
    const supabase = this.supabaseService.getClient();
    
    try {
      // Create the report configuration
      const { data: config, error: configError } = await supabase
        .from('report_configurations')
        .insert({
          name: dto.name,
          description: dto.description,
          report_type_id: dto.report_type_id,
          schedule_cron: dto.schedule_cron,
          schedule_description: dto.schedule_description,
          subject_template: dto.subject_template,
          include_summary: dto.include_summary ?? true,
          include_employee_details: dto.include_employee_details ?? true,
          include_alerts: dto.include_alerts ?? true,
          include_projects: dto.include_projects ?? true,
          alert_settings: dto.alert_settings || {},
          filters: dto.filters || {},
          organization_id: dto.organization_id || null,
        })
        .select()
        .single();

      if (configError) {
        console.error('Failed to create report configuration:', configError.message);
        throw new Error('Failed to create report configuration');
      }

      // Add recipients
      if (dto.recipients && dto.recipients.length > 0) {
        await this.updateReportRecipients(config.id, dto.recipients);
      }

      return { success: true, data: config };
    } catch (error) {
      console.error('Failed to create report configuration:', error);
      throw new Error('Failed to create report configuration');
    }
  }

  // Update a report configuration
  @Put('configurations/:id')
  @Roles('admin')
  async updateReportConfiguration(
    @Param('id') id: string,
    @Body() dto: UpdateReportConfigDto,
  ) {
    const supabase = this.supabaseService.getClient();
    
    try {
      // Update the report configuration
      const { data: config, error: configError } = await supabase
        .from('report_configurations')
        .update({
          name: dto.name,
          description: dto.description,
          schedule_cron: dto.schedule_cron,
          schedule_description: dto.schedule_description,
          subject_template: dto.subject_template,
          include_summary: dto.include_summary,
          include_employee_details: dto.include_employee_details,
          include_alerts: dto.include_alerts,
          include_projects: dto.include_projects,
          alert_settings: dto.alert_settings,
          filters: dto.filters,
          is_active: dto.is_active,
        })
        .eq('id', id)
        .select()
        .single();

      if (configError) {
        console.error('Failed to update report configuration:', configError.message);
        throw new Error('Failed to update report configuration');
      }

      // Update recipients if provided
      if (dto.recipients) {
        await this.updateReportRecipients(id, dto.recipients);
      }

      return { success: true, data: config };
    } catch (error) {
      console.error('Failed to update report configuration:', error);
      throw new Error('Failed to update report configuration');
    }
  }

  // Delete a report configuration
  @Delete('configurations/:id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReportConfiguration(@Param('id') id: string) {
    const supabase = this.supabaseService.getClient();
    
    const { error } = await supabase
      .from('report_configurations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete report configuration:', error.message);
      throw new Error('Failed to delete report configuration');
    }

    return { success: true };
  }

  // Test email configuration
  @Post('test-email')
  @Roles('admin')
  async testEmailConfiguration() {
    return await this.emailReportsService.testEmailConfiguration();
  }

  // Send a specific report manually (test)
  @Post('configurations/:id/send-test')
  @Roles('admin')
  async sendTestReport(@Param('id') id: string) {
    return await this.emailReportsService.sendReport(id, true);
  }

  // Send a specific report to all recipients
  @Post('configurations/:id/send')
  @Roles('admin')
  async sendReport(@Param('id') id: string) {
    return await this.emailReportsService.sendReport(id, false);
  }

  // Get report history
  @Get('history')
  @Roles('admin')
  async getReportHistory(
    @Query('config_id') configId?: string,
    @Query('limit') limit = 50,
    @Query('organization_id') organizationId?: string,
  ) {
    const supabase = this.supabaseService.getClient();
    
    let query = supabase
      .from('report_history')
      .select(`
        *,
        report_configurations (name)
      `)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (configId) {
      query = query.eq('report_config_id', configId);
    }
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error('Failed to fetch report history');
    }

    return { success: true, data };
  }

  // Get admin users for recipients selection
  @Get('admin-users')
  @Roles('admin')
  async getAdminUsers(@Query('organization_id') organizationId?: string) {
    const supabase = this.supabaseService.getClient();
    
    let query = supabase
      .from('users')
      .select('id, email, full_name')
      .eq('role', 'admin')
      .order('full_name');

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error('Failed to fetch admin users');
    }

    return { success: true, data };
  }

  private async updateReportRecipients(configId: string, recipients: string[]) {
    const supabase = this.supabaseService.getClient();
    
    // Delete existing recipients
    await supabase
      .from('report_recipients')
      .delete()
      .eq('report_config_id', configId);

    // Add new recipients
    if (recipients.length > 0) {
      // Get user details for the recipients
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email')
        .in('id', recipients);

      if (usersError) {
        throw new Error('Failed to fetch user details');
      }

      const recipientRecords = users.map(user => ({
        report_config_id: configId,
        user_id: user.id,
        email: user.email,
      }));

      const { error: insertError } = await supabase
        .from('report_recipients')
        .insert(recipientRecords);

      if (insertError) {
        throw new Error('Failed to add recipients');
      }
    }
  }
} 