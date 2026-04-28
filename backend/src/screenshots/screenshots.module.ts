import { Module } from '@nestjs/common';
import { ScreenshotsController } from './screenshots.controller';
import { ScreenshotsService } from './screenshots.service';
import { ScreenshotsResolver } from './screenshots.resolver';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [CommonModule, AuthModule],
  controllers: [ScreenshotsController],
  providers: [ScreenshotsService, ScreenshotsResolver],
  exports: [ScreenshotsService],
})
export class ScreenshotsModule {} 