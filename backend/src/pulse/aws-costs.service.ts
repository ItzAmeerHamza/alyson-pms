import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AwsCostBreakdownRow = {
  key: string;
  service: string;
  team: string;
  cost: number;
  day: number;
  week: number;
  mtd: number;
};

export type AwsCostDailyRecord = {
  date: string;
  service: string;
  team: string;
  cost_usd: number;
};

export type AwsCostSummary = {
  team: string;
  start: string;
  end: string;
  today: string;
  weekStart: string;
  mtdStart: string;
  lastSyncedAt: string | null;
  totals: { period: number; day: number; week: number; mtd: number };
  breakdown: AwsCostBreakdownRow[];
  records: AwsCostDailyRecord[];
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value?: string): string | null {
  const key = String(value || '').trim().slice(0, 10);
  return DATE_KEY.test(key) ? key : null;
}

/**
 * Alyson PM tagged AWS costs. The API Lambda has no NAT, so Cost Explorer /
 * Cost Explorer Supabase are read by invoking the existing public
 * aws-cost-explorer-lambda (same Option A pattern as SES / Cognito / leave-scan).
 */
@Injectable()
export class AwsCostsService {
  private readonly logger = new Logger(AwsCostsService.name);
  private readonly lambdaClient: LambdaClient;
  private readonly functionName: string;

  constructor(config: ConfigService) {
    const region =
      config.get<string>('AWS_REGION') ||
      config.get<string>('COGNITO_REGION') ||
      'us-west-2';
    this.functionName = (
      config.get<string>('AWS_COST_EXPLORER_FUNCTION_NAME') || 'aws-cost-explorer-lambda'
    ).trim();
    const lambdaEndpoint = (config.get<string>('LAMBDA_VPC_ENDPOINT_URL') || '').trim();
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    const useStaticDevCredentials = Boolean(
      accessKeyId?.startsWith('AKIA') &&
        secretAccessKey &&
        !config.get<string>('AWS_SESSION_TOKEN'),
    );
    this.lambdaClient = new LambdaClient({
      region,
      ...(lambdaEndpoint ? { endpoint: lambdaEndpoint } : {}),
      ...(useStaticDevCredentials
        ? { credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } }
        : {}),
    });
  }

  async getAlysonPmCosts(range: { start?: string; end?: string } = {}): Promise<AwsCostSummary> {
    const start = parseDateKey(range.start);
    const end = parseDateKey(range.end);
    const payload: Record<string, string> = { action: 'query', team: 'Alyson PM' };
    if (start) payload.start = start;
    if (end) payload.end = end;

    const out = await this.lambdaClient.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(payload)),
      }),
    );

    const raw = out.Payload ? Buffer.from(out.Payload).toString('utf8') : '';
    if (out.FunctionError) {
      this.logger.error(`AWS cost query failed (${out.FunctionError})`);
      throw new InternalServerErrorException('Could not load AWS costs');
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      this.logger.error('AWS cost query returned non-JSON');
      throw new InternalServerErrorException('Could not load AWS costs');
    }

    // HTTP-style Lambda responses wrap JSON in body.
    if (typeof parsed.body === 'string') {
      try {
        parsed = JSON.parse(parsed.body) as Record<string, unknown>;
      } catch {
        throw new InternalServerErrorException('Could not load AWS costs');
      }
    }

    if (parsed.ok === false) {
      throw new InternalServerErrorException('Could not load AWS costs');
    }

    const totals = (parsed.totals || {}) as Record<string, unknown>;
    const breakdown = Array.isArray(parsed.breakdown) ? parsed.breakdown : [];
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    const periodStart = String(parsed.start || start || '');
    const periodEnd = String(parsed.end || end || '');

    return {
      team: String(parsed.team || 'Alyson PM'),
      start: periodStart,
      end: periodEnd,
      today: String(parsed.today || ''),
      weekStart: String(parsed.weekStart || ''),
      mtdStart: String(parsed.mtdStart || ''),
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
      totals: {
        period: Number(totals.period) || 0,
        day: Number(totals.day) || 0,
        week: Number(totals.week) || 0,
        mtd: Number(totals.mtd) || 0,
      },
      breakdown: breakdown.map((row: Record<string, unknown>, index: number) => ({
        key: String(row.key || `${row.service}-${row.team}-${index}`),
        service: String(row.service || 'Unknown'),
        team: String(row.team || 'Alyson PM'),
        cost: Number(row.cost) || 0,
        day: Number(row.day) || 0,
        week: Number(row.week) || 0,
        mtd: Number(row.mtd) || 0,
      })),
      records: records
        .map((row: Record<string, unknown>) => ({
          date: String(row.date || '').slice(0, 10),
          service: String(row.service || 'Unknown'),
          team: String(row.team || 'Alyson PM'),
          cost_usd: Number(row.cost_usd) || 0,
        }))
        .filter(
          (row) =>
            /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.cost_usd) && row.cost_usd > 0,
        ),
    };
  }
}
