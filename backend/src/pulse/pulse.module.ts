import { Module } from '@nestjs/common';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AccessGrantsModule } from '../access-grants/access-grants.module';
import { UsersModule } from '../users/users.module';
import { ScreenshotAiModule } from '../screenshot-ai/screenshot-ai.module';
import { SesEmailService } from '../common/ses-email.service';
import { PacingService } from './pacing.service';
import { EffectiveTimeService } from './effective-time.service';
import { AwsCostsService } from './aws-costs.service';
import { WorkspaceAdminService } from './workspace-admin.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuthModule, DatabaseModule, AccessGrantsModule, UsersModule, ScreenshotAiModule, BillingModule],
  controllers: [PulseController, AssistantController],
  providers: [
    PulseService,
    SesEmailService,
    PacingService,
    EffectiveTimeService,
    AwsCostsService,
    WorkspaceAdminService,
    AssistantService,
  ],
  // EffectiveTimeService is exported so the desktop agent's endpoint in
  // ForceSyncController computes effective time from the same rules the web
  // reports use, rather than the agent keeping its own copy that drifts.
  exports: [PulseService, PacingService, EffectiveTimeService],
})
export class PulseModule {}
