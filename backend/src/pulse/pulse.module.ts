import { Module } from '@nestjs/common';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AccessGrantsModule } from '../access-grants/access-grants.module';
import { SesEmailService } from '../common/ses-email.service';
import { PacingService } from './pacing.service';
import { EffectiveTimeService } from './effective-time.service';

@Module({
  imports: [AuthModule, DatabaseModule, AccessGrantsModule],
  controllers: [PulseController],
  providers: [PulseService, SesEmailService, PacingService, EffectiveTimeService],
  // EffectiveTimeService is exported so the desktop agent's endpoint in
  // ForceSyncController computes effective time from the same rules the web
  // reports use, rather than the agent keeping its own copy that drifts.
  exports: [PulseService, PacingService, EffectiveTimeService],
})
export class PulseModule {}
