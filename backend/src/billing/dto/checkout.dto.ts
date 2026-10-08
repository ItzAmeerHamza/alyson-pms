import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BILLING_PLAN_IDS } from '../billing.catalog';

export class CheckoutDto {
  @IsIn(BILLING_PLAN_IDS)
  planId: (typeof BILLING_PLAN_IDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^\/dashboard\/alyson-pulse(\/[a-z0-9/-]*)?$/)
  returnPath?: string;
}

export class PortalDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^\/dashboard\/alyson-pulse(\/[a-z0-9/-]*)?$/)
  returnPath?: string;
}
