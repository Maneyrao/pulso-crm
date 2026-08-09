import { Injectable } from '@nestjs/common';
import { type ApiEnv, parseApiEnv } from '@pulso/config';

/**
 * Configuración validada.
 *
 * Se parsea una vez al arrancar: si falta algo, el proceso no levanta y dice
 * qué falta. Es preferible a descubrirlo con un `undefined` en producción.
 */
@Injectable()
export class AppConfig {
  readonly env: ApiEnv;

  constructor(env?: ApiEnv) {
    this.env = env ?? parseApiEnv();
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }
}
