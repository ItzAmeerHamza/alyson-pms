import { Module } from '@nestjs/common';
import { PulseController } from './pulse.controller';
import { PulseService } from './pulse.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AccessGrantsModule } from '../access-grants/access-grants.module';
import { SesEmailService } from '../common/ses-email.service';
import { PacingService } from './pacing.service';

@Module({
  imports: [AuthModule, DatabaseModule, AccessGrantsModule],
  controllers: [PulseController],
  providers: [PulseService, SesEmailService, PacingService],
  exports: [PulseService, PacingService],
})
export class PulseModule {}
