import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from './billing.service';

export const REQUIRE_BILLING_FEATURE = 'require_billing_feature';

export const RequireBillingFeature = (featureId: string) =>
  SetMetadata(REQUIRE_BILLING_FEATURE, featureId);

@Injectable()
export class BillingFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureId = this.reflector.getAllAndOverride<string>(REQUIRE_BILLING_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureId) return true;
    const request = context.switchToHttp().getRequest<{ user?: { organization_id?: string | null } }>();
    await this.billing.assertFeature(request.user || {}, featureId);
    return true;
  }
}
