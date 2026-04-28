import { ReportConfig } from "../types.ts";

// Database Operations
export class ReportConfigService {
  constructor(private supabase: any) {}

  async getActiveConfigs(reportType?: string, organizationId?: string): Promise<ReportConfig[]> {
    let query = this.supabase
      .from('report_configurations')
      .select(`
        *,
        report_types(*)
      `)
      .eq('is_active', true);

    // Filter by report type if specified
    if (reportType === 'daily') {
      query = query.eq('report_types.template_type', 'daily');
    } else if (reportType === 'weekly') {
      query = query.eq('report_types.template_type', 'weekly');
    }

    // Filter by organization if specified
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch report configurations: ${error.message}`);
    }

    return data || [];
  }
} 