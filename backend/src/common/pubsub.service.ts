import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSub } from 'graphql-subscriptions';
import Redis from 'ioredis';

@Injectable()
export class PubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(PubSubService.name);
  private pubSub: PubSub;
  private redisPublisher: Redis;
  private redisSubscriber: Redis;

  constructor(@Optional() private configService?: ConfigService) {
    this.pubSub = new PubSub();
    const skipRedis = process.env.SKIP_REDIS === '1' || process.env.NODE_ENV === 'test';
    if (skipRedis) {
      this.logger.warn('Redis disabled for tests (SKIP_REDIS=1). Using in-memory PubSub.');
      return;
    }
    this.initializeRedis();
  }

  private initializeRedis() {
    const getCfg = (key: string, fallback?: string) =>
      this.configService?.get<string>(key) || process.env[key] || fallback;

    const redisConfig = {
      host: getCfg('REDIS_HOST', '127.0.0.1'),
      port: parseInt(getCfg('REDIS_PORT', '6379')!),
      password: getCfg('REDIS_PASSWORD'),
      db: parseInt(getCfg('REDIS_DB', '0')!),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    };

    this.redisPublisher = new Redis(redisConfig);
    this.redisSubscriber = new Redis(redisConfig);

    this.redisPublisher.on('connect', () => {
      this.logger.log('Redis publisher connected');
    });

    this.redisSubscriber.on('connect', () => {
      this.logger.log('Redis subscriber connected');
    });

    this.redisPublisher.on('error', (error) => {
      this.logger.error('Redis publisher error:', error);
    });

    this.redisSubscriber.on('error', (error) => {
      this.logger.error('Redis subscriber error:', error);
    });
  }

  async publish(channel: string, message: Record<string, unknown>): Promise<void> {
    try {
      if (!this.redisPublisher) {
        // In-memory only; notify subscribers via PubSub
        await this.pubSub.publish(channel, message);
        return;
      }
      await this.redisPublisher.publish(channel, JSON.stringify(message));
      this.logger.debug(`Published to ${channel}:`, message);
    } catch (error) {
      this.logger.error(`Failed to publish to ${channel}:`, error);
      throw error;
    }
  }

  asyncIterator<T>(triggers: string | string[]): AsyncIterator<T> {
    const triggerArray = Array.isArray(triggers) ? triggers : [triggers];
    
    return {
      [Symbol.asyncIterator]: () => this.createAsyncIterator<T>(triggerArray),
    }[Symbol.asyncIterator]();
  }

  private async *createAsyncIterator<T>(triggers: string[]): AsyncGenerator<T> {
    if (!this.redisSubscriber) {
      // Fallback to in-memory async iterator via PubSub
      // @ts-ignore
      return this.pubSub.asyncIterator<T>(triggers);
    }

    const getCfg = (key: string, fallback?: string) =>
      this.configService?.get<string>(key) || process.env[key] || fallback;

    const subscriber = new Redis({
      host: getCfg('REDIS_HOST', '127.0.0.1'),
      port: parseInt(getCfg('REDIS_PORT', '6379')!),
      password: getCfg('REDIS_PASSWORD'),
      db: parseInt(getCfg('REDIS_DB', '0')!),
    });

    const messageQueue: T[] = [];
    let resolveNext: ((value: IteratorResult<T>) => void) | null = null;
    const isCompleted = false;

    // Subscribe to all triggers
    await subscriber.subscribe(...triggers);

    subscriber.on('message', (channel: string, message: string) => {
      try {
        const payload = JSON.parse(message) as T;
        
        if (resolveNext) {
          resolveNext({ value: payload, done: false });
          resolveNext = null;
        } else {
          messageQueue.push(payload);
        }
      } catch (error) {
        this.logger.error('Failed to parse Redis message:', error);
      }
    });

    try {
      while (!isCompleted) {
        if (messageQueue.length > 0) {
          const value = messageQueue.shift()!;
          yield value;
        } else {
          // Wait for next message
          await new Promise<void>((resolve) => {
            resolveNext = (result) => {
              if (!result.done) {
                resolve();
              }
            };
          });
          
          if (messageQueue.length > 0) {
            const value = messageQueue.shift()!;
            yield value;
          }
        }
      }
    } finally {
      if (subscriber) {
        await subscriber.disconnect();
      }
    }
  }

  async onModuleDestroy() {
    try {
      if (this.redisPublisher) await this.redisPublisher.disconnect();
      if (this.redisSubscriber) await this.redisSubscriber.disconnect();
      this.logger.log('Redis connections closed');
    } catch (error) {
      this.logger.error('Error closing Redis connections:', error);
    }
  }
} 