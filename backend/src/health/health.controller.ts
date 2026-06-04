import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

interface HealthCheckEntry {
  status: string;
  latency_ms: number;
  error?: string;
  backend?: 'rds' | 'supabase';
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, HealthCheckEntry>;
  timestamp: string;
  uptime_seconds: number;
}

const startTime = Date.now();

@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly supabase: SupabaseClient | null;

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.supabase =
      supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey)
        : null;
  }

  @Get()
  async check(): Promise<HealthCheck> {
    const checks: HealthCheck['checks'] = {};

    const dbStart = Date.now();
    try {
      if (this.databaseService.isEnabled()) {
        const ping = await this.databaseService.ping();
        const latency = ping.latencyMs;
        checks.database = {
          status: ping.ok
            ? latency > 2000
              ? 'degraded'
              : 'healthy'
            : 'unhealthy',
          latency_ms: latency,
          backend: 'rds',
          ...(ping.error && { error: ping.error }),
        };
      } else if (this.supabase) {
        const { error } = await this.supabase
          .from('users')
          .select('id')
          .limit(1);
        const latency = Date.now() - dbStart;
        checks.database = {
          status: error ? 'unhealthy' : latency > 2000 ? 'degraded' : 'healthy',
          latency_ms: latency,
          backend: 'supabase',
          ...(error && { error: error.message }),
        };
      } else {
        checks.database = {
          status: 'unhealthy',
          latency_ms: 0,
          error: 'No database configured (set DATABASE_URL or Supabase env)',
        };
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      checks.database = {
        status: 'unhealthy',
        latency_ms: Date.now() - dbStart,
        error: message,
      };
    }

    const redisHost = this.configService.get<string>('REDIS_HOST');
    if (redisHost) {
      const redisStart = Date.now();
      try {
        const IORedis = require('ioredis');
        const redis = new IORedis({
          host: redisHost,
          port: parseInt(this.configService.get<string>('REDIS_PORT') || '6379'),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          connectTimeout: 2000,
          lazyConnect: true,
        });
        await redis.connect();
        await redis.ping();
        const latency = Date.now() - redisStart;
        checks.redis = {
          status: latency > 500 ? 'degraded' : 'healthy',
          latency_ms: latency,
        };
        await redis.disconnect();
      } catch (e: any) {
        checks.redis = {
          status: 'unhealthy',
          latency_ms: Date.now() - redisStart,
          error: e.message,
        };
      }
    }

    const allStatuses = Object.values(checks).map((c) => c.status);
    let overall: HealthCheck['status'] = 'healthy';
    if (allStatuses.includes('unhealthy')) overall = 'unhealthy';
    else if (allStatuses.includes('degraded')) overall = 'degraded';

    return {
      status: overall,
      checks,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    };
  }
}
