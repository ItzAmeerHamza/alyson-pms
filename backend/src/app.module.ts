import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { DataModule } from './data/data.module';
import { PulseModule } from './pulse/pulse.module';
import { ForceSyncController } from './sync/force-sync.controller';
import { HealthController } from './health/health.controller';

/**
 * Alyson Pulse backend — minimal Lambda-friendly API surface.
 * Desktop agent sync + JWT data reads + Pulse dashboard aggregates.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 120 },
    ]),

    CommonModule,
    AuthModule,
    DataModule,
    PulseModule,
  ],
  controllers: [ForceSyncController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
