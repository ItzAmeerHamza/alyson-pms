import { Module } from '@nestjs/common';
import { DataController } from './data.controller';
import { DataService } from './data.service';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [AuthModule, DatabaseModule, CommonModule],
  controllers: [DataController],
  providers: [DataService],
  exports: [DataService],
})
export class DataModule {}

