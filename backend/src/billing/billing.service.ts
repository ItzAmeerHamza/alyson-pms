import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AutumnAction, runAutumnAction } from './autumn.actions';
import { BILLING_PLANS } from './billing.catalog';
import { parseWorkspaceId } from '../database/time-doctor-sql';

export type BillingEntitlements = {
  enabled: boolean;
  customerId: string | null;
  features: Record<string, boolean>;
  seatsRemaining: number | null;
  plans: Array<{
    id: string;
    name: string;
    monthlyAmount: number;
    includedSeats: number;
    extraSeatAmount: number;
  }>;
};

const ALL_FEATURES_ON: Record<string, boolean> = {
  team_reports: true,
  leave: true,
  pacing: true,
  projects: true,
  screenshot_ai: true,
  seats: true,
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly secret: string;
  private readonly functionName: string;
  private readonly lambda: LambdaClient | null;

  constructor(config: ConfigService) {
    this.secret = (config.get<string>('AUTUMN_SECRET_KEY') || '').trim();
    this.functionName = (config.get<string>('AUTUMN_FUNCTION_NAME') || '').trim();
    if (this.functionName && !this.secret) {
      const region = config.get<string>('AWS_REGION') || config.get<string>('COGNITO_REGION') || 'us-west-2';
      const endpoint = (config.get<string>('LAMBDA_VPC_ENDPOINT_URL') || '').trim();
      this.lambda = new LambdaClient({
        region,
        ...(endpoint ? { endpoint } : {}),
      });
    } else {
      this.lambda = null;
    }
  }

  isEnabled(): boolean {
    return Boolean(this.secret || this.functionName);
  }

  disabledEntitlements(): BillingEntitlements {
    return {
      enabled: false,
      customerId: null,
      features: { ...ALL_FEATURES_ON },
      seatsRemaining: null,
      plans: BILLING_PLANS.map((plan) => ({
        id: plan.id,
        name: plan.name,
        monthlyAmount: plan.monthlyAmount,
        includedSeats: plan.includedSeats,
        extraSeatAmount: plan.extraSeatAmount,
      })),
    };
  }

  async ensureCustomer(workspaceId: string, name?: string): Promise<void> {
    if (!this.isEnabled()) return;
    await this.dispatch({ action: 'ensure', workspaceId, name });
  }

  async entitlements(workspaceId: string, name?: string): Promise<BillingEntitlements> {
    if (!this.isEnabled()) return this.disabledEntitlements();
    try {
      const result = await this.dispatch({ action: 'entitlements', workspaceId, name });
      return {
        enabled: true,
        customerId: typeof result.customerId === 'string' ? result.customerId : null,
        features: {
          ...ALL_FEATURES_ON,
          ...(result.features && typeof result.features === 'object' ? result.features as Record<string, boolean> : {}),
        },
        seatsRemaining: typeof result.seatsRemaining === 'number' ? result.seatsRemaining : null,
        plans: BILLING_PLANS.map((plan) => ({
        id: plan.id,
        name: plan.name,
        monthlyAmount: plan.monthlyAmount,
        includedSeats: plan.includedSeats,
        extraSeatAmount: plan.extraSeatAmount,
      })),
      };
    } catch (err) {
      this.logger.warn(`Autumn entitlements skipped: ${err instanceof Error ? err.message : 'failed'}`);
      return { ...this.disabledEntitlements(), enabled: true };
    }
  }

  /**
   * When Autumn is not configured, existing companies keep full access.
   * A failed Autumn call also stays open so a blip does not lock the product.
   * An explicit allowed:false from Autumn is the lock.
   */
  async assertFeature(user: { organization_id?: string | null }, featureId: string): Promise<void> {
    if (!this.isEnabled()) return;
    const workspaceId = parseWorkspaceId(user.organization_id);
    if (!workspaceId) return;
    try {
      const result = await this.dispatch({
        action: 'check',
        workspaceId: String(workspaceId),
        featureId,
      });
      if (result.allowed === false) {
        throw new ForbiddenException('This plan does not include that feature');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.warn(`Autumn check skipped: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  async attach(workspaceId: string, planId: string, successUrl?: string, name?: string): Promise<string | null> {
    this.requireEnabled();
    try {
      const result = await this.dispatch({
        action: 'attach',
        workspaceId,
        planId,
        successUrl,
        name,
      });
      return typeof result.paymentUrl === 'string' ? result.paymentUrl : null;
    } catch (err) {
      this.logger.warn(`Autumn attach failed: ${err instanceof Error ? err.message : 'failed'}`);
      throw new ServiceUnavailableException('Billing is unavailable');
    }
  }

  async portal(workspaceId: string, returnUrl?: string): Promise<string | null> {
    this.requireEnabled();
    try {
      const result = await this.dispatch({ action: 'portal', workspaceId, returnUrl });
      return typeof result.url === 'string' ? result.url : null;
    } catch (err) {
      this.logger.warn(`Autumn portal failed: ${err instanceof Error ? err.message : 'failed'}`);
      throw new ServiceUnavailableException('Billing is unavailable');
    }
  }

  private requireEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Billing is unavailable');
    }
  }

  private async dispatch(event: AutumnAction): Promise<Record<string, unknown>> {
    if (this.secret) return runAutumnAction(this.secret, event);
    return this.invoke(event);
  }

  private async invoke(event: AutumnAction): Promise<Record<string, unknown>> {
    if (!this.lambda || !this.functionName) {
      throw new Error('Autumn is not configured');
    }
    const out = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(event)),
      }),
    );
    if (out.FunctionError) {
      throw new Error('Autumn request failed');
    }
    const raw = out.Payload ? Buffer.from(out.Payload).toString('utf8') : '';
    let body: { ok?: boolean; result?: Record<string, unknown> };
    try {
      body = JSON.parse(raw || '{}') as typeof body;
    } catch {
      throw new Error('Autumn request failed');
    }
    if (!body.ok || !body.result) {
      throw new Error('Autumn request failed');
    }
    return body.result;
  }
}
