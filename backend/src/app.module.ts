import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import { AuthModule } from './auth/auth.module';
import { ScreenshotsModule } from './screenshots/screenshots.module';
import { InsightsModule } from './insights/insights.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkersModule } from './workers/workers.module';
import { ReportsModule } from './reports/reports.module';
import { CommonModule } from './common/common.module';
import { AIAnalysisModule } from './ai-analysis/ai-analysis.module';
import { CronModule } from './cron/cron.module';
import { ForceSyncController } from './sync/force-sync.controller';
import { HealthController } from './health/health.controller';

/** Lambda / serverless: no Redis, GraphQL, or in-process cron. */
const serverlessMode =
  process.env.SERVERLESS_MODE === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ...(serverlessMode
      ? []
      : [
          // Scheduled tasks: use EventBridge → Lambda in serverless (not in-process)
          ScheduleModule.forRoot(),
        ]),

    // GraphQL (disabled during tests or serverless)
    ...(serverlessMode || process.env.DISABLE_GRAPHQL === '1'
      ? []
      : [
          GraphQLModule.forRoot<ApolloDriverConfig>({
            driver: ApolloDriver,
            autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
            subscriptions: {
              'graphql-ws': true,
              'subscriptions-transport-ws': true,
            },
            context: ({ req }) => ({ req }),
            playground: process.env.NODE_ENV !== 'production',
            introspection: process.env.NODE_ENV !== 'production',
          }),
        ]),

    ...(serverlessMode
      ? []
      : [
          BullModule.forRootAsync({
            useFactory: () => ({
              redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB) || 0,
              },
            }),
          }),
        ]),

    // Rate limiting: default 60 req/min, named 'strict' for sensitive endpoints
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60000, limit: 60 },
      { name: 'strict', ttl: 60000, limit: 10 },
    ]),

    // Feature modules
    CommonModule,
    AuthModule,
    ScreenshotsModule,
    InsightsModule,
    NotificationsModule,
    ReportsModule,
    ...(serverlessMode ? [] : [WorkersModule, AIAnalysisModule, CronModule]),
  ],
  controllers: [ForceSyncController, HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {} 