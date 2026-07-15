import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { TimeDoctorController } from './timedoctor.controller';
import { TimeDoctorService } from './timedoctor.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TimeDoctorController],
  providers: [TimeDoctorService],
  exports: [TimeDoctorService],
})
export class TimeDoctorModule {}
