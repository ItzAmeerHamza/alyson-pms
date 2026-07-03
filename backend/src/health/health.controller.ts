import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: string; latency_ms: number; error?: string }>;
  timestamp: string;
  uptime_seconds: number;
}

const startTime = Date.now();

@SkipThrottle({ default: true, strict: true })
@Controller('health')
export class HealthController {
  constructor(private databaseService: DatabaseService) {}

  @Get()
  async check(): Promise<HealthCheck> {
    const checks: HealthCheck['checks'] = {};
    const dbStart = Date.now();

    try {
      if (!this.databaseService.isEnabled()) {
        checks.database = {
          status: 'unhealthy',
          latency_ms: 0,
          error: 'DATABASE_URL or DATABASE_HOST not configured',
        };
      } else {
        const ping = await this.databaseService.ping();
        const latency = ping.latencyMs;
        checks.database = {
          status: ping.ok ? (latency > 2000 ? 'degraded' : 'healthy') : 'unhealthy',
          latency_ms: latency,
          ...(ping.error && { error: ping.error }),
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

    const statuses = Object.values(checks).map((c) => c.status);
    let overall: HealthCheck['status'] = 'healthy';
    if (statuses.includes('unhealthy')) overall = 'unhealthy';
    else if (statuses.includes('degraded')) overall = 'degraded';

    return {
      status: overall,
      checks,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    };
  }
}
