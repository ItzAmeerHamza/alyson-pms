import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: string; latency_ms: number; error?: string }>;
  timestamp: string;
  uptime_seconds: number;
}

const startTime = Date.now();

@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly supabase;

  constructor(private configService: ConfigService) {
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL'),
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    );
  }

  @Get()
  async check(): Promise<HealthCheck> {
    const checks: HealthCheck['checks'] = {};

    const dbStart = Date.now();
    try {
      const { error } = await this.supabase
        .from('users')
        .select('id')
        .limit(1);
      const latency = Date.now() - dbStart;
      checks.database = {
        status: error ? 'unhealthy' : latency > 2000 ? 'degraded' : 'healthy',
        latency_ms: latency,
        ...(error && { error: error.message }),
      };
    } catch (e: any) {
      checks.database = {
        status: 'unhealthy',
        latency_ms: Date.now() - dbStart,
        error: e.message,
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
