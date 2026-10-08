import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { SesEmailService } from '../common/ses-email.service';
import { CognitoAdminService } from './cognito-admin.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AuthModule, DatabaseModule, BillingModule],
  controllers: [UsersController],
  providers: [UsersService, CognitoAdminService, SesEmailService],
  exports: [UsersService],
})
export class UsersModule {}
