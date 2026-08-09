import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../../common/config/app-config.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(private readonly config: AppConfig) {
    this.client = new Redis(this.config.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    // Sin este handler, un corte de Redis tumba el proceso con un
    // unhandled 'error'. Preferimos degradar y que /health/ready lo reporte.
    this.client.on('error', () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }

  async isHealthy(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
