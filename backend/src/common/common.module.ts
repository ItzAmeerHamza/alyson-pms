import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { AccountActivationService } from './account-activation.service';
import { S3Service } from './s3.service';
import { SesEmailService } from './ses-email.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [S3Service, SesEmailService, AccountActivationService],
  exports: [S3Service, SesEmailService, AccountActivationService],
})
export class CommonModule {}
