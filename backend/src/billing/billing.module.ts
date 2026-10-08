import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingFeatureGuard } from './billing-feature.guard';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, BillingFeatureGuard],
  exports: [BillingService, BillingFeatureGuard],
})
export class BillingModule {}
