import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AccessGrantsController } from './access-grants.controller';
import { AccessGrantsService } from './access-grants.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AccessGrantsController],
  providers: [AccessGrantsService],
  exports: [AccessGrantsService],
})
export class AccessGrantsModule {}
