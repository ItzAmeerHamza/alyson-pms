import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {
    const poolConfig = this.buildPoolConfig();
    if (!poolConfig) {
      this.logger.log('RDS not configured — set DATABASE_HOST or DATABASE_URL');
      return;
    }

    this.pool = new Pool(poolConfig);

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected RDS pool error', err);
    });

    this.logger.log('RDS PostgreSQL pool initialized');
  }

  /**
   * Prefer DATABASE_HOST + DATABASE_PASSWORD (avoids URL-encoding special chars).
   * Falls back to DATABASE_URL when host/password vars are not set.
   */
  private buildPoolConfig(): PoolConfig | null {
    const host = this.configService.get<string>('DATABASE_HOST');
    const password = this.configService.get<string>('DATABASE_PASSWORD');
    const sslEnabled =
      this.configService.get<string>('DATABASE_SSL', 'true') === 'true';
    const max = parseInt(
      this.configService.get<string>('DATABASE_POOL_MAX', '10'),
      10,
    );

    if (host && password !== undefined) {
      return {
        host,
        port: parseInt(this.configService.get<string>('DATABASE_PORT', '5432'), 10),
        user: this.configService.get<string>('DATABASE_USER', 'postgres'),
        password,
        database: this.configService.get<string>('DATABASE_NAME', 'postgres'),
        max,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ssl: this.buildSslOptions(sslEnabled),
      };
    }

    const url = this.configService.get<string>('DATABASE_URL');
    if (!url) {
      return null;
    }

    try {
      // Fail fast with a clear error if the URL is malformed
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      this.logger.error(
        'DATABASE_URL is invalid (often caused by ? or @ in the password). ' +
          'Use DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME instead.',
      );
      return null;
    }

    return {
      connectionString: url,
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: this.buildSslOptions(sslEnabled),
    };
  }

  /**
   * RDS uses Amazon CA certs. Node may error with "self-signed certificate in certificate chain"
   * unless you set DATABASE_SSL_CA_PATH or DATABASE_SSL_REJECT_UNAUTHORIZED=false (dev only).
   */
  private buildSslOptions(
    sslEnabled: boolean,
  ): PoolConfig['ssl'] | undefined {
    if (!sslEnabled) {
      return undefined;
    }

    const caPath = this.configService.get<string>('DATABASE_SSL_CA_PATH');
    if (caPath) {
      const resolved = resolve(caPath);
      if (existsSync(resolved)) {
        return {
          rejectUnauthorized: true,
          ca: readFileSync(resolved, 'utf8'),
        };
      }
      this.logger.warn(`DATABASE_SSL_CA_PATH not found: ${resolved}`);
    }

    const strictVerify =
      this.configService.get<string>('DATABASE_SSL_REJECT_UNAUTHORIZED', 'true') !==
      'false';

    if (!strictVerify) {
      this.logger.warn(
        'RDS SSL: certificate verification disabled (DATABASE_SSL_REJECT_UNAUTHORIZED=false). Use only for local dev.',
      );
    }

    return { rejectUnauthorized: strictVerify };
  }

  isEnabled(): boolean {
    return this.pool !== null;
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('RDS database is not configured');
    }
    return this.pool.query<T>(text, params);
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('RDS database is not configured');
    }
    return this.pool.connect();
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    if (!this.pool) {
      return { ok: false, latencyMs: 0, error: 'RDS database not configured' };
    }
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, latencyMs: Date.now() - start, error: message };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
