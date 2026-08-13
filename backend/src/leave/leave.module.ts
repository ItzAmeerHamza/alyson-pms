import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScreenshotAiModule } from '../screenshot-ai/screenshot-ai.module';
import { GmailDwdService } from './gmail-dwd.service';
import { LeaveClassifyService } from './leave-classify.service';
import { LeaveController } from './leave.controller';
import { LeaveInternalController } from './leave-internal.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [AuthModule, ScreenshotAiModule],
  controllers: [LeaveController, LeaveInternalController],
  providers: [LeaveService, GmailDwdService, LeaveClassifyService],
  exports: [LeaveService],
})
export class LeaveModule {}
