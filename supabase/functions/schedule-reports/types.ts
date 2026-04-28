// Types for Schedule Reports Function
export interface ReportConfig {
  id: string;
  name: string;
  is_active: boolean;
  report_types?: {
    template_type: 'daily' | 'weekly';
  };
}

export interface ReportResult {
  reportId: string;
  reportName: string;
  reportType?: string;
  success: boolean;
  message: string;
  recipients?: number;
}

export interface ScheduleRequest {
  reportType?: 'daily' | 'weekly';
  automated?: boolean;
}

export interface ScheduleResponse {
  success: boolean;
  message: string;
  results?: ReportResult[];
  summary?: {
    total: number;
    sent: number;
    failed: number;
    totalRecipients: number;
  };
}

// Constants
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'https://timeflow.ebdaadt.com,http://localhost:8080,http://localhost:5173').split(',').map(o => o.trim());

export function getCorsHeaders(req?: Request) {
  const origin = req?.headers?.get('origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.some(o => origin === o) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

export const CORS_HEADERS = getCorsHeaders(); 