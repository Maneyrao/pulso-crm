import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AccessModule } from '../access/access.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { BiometricCryptoService } from './biometric-crypto.service.js';
import { AppConfig } from '../../common/config/app-config.js';
import {
  BIOMETRIC_MATCHER,
  HttpSourceAfisMatcher,
  TemplateEqualityMatcher,
} from './biometric-matcher.js';
import {
  AgentBiometricsController,
  BiometricsController,
  MemberBiometricsController,
} from './biometrics.controller.js';
import { BiometricsService } from './biometrics.service.js';

/**
 * Biometría (Etapas 7-8): consentimiento, enrolamiento, credenciales
 * cifradas e identificación 1:N. SourceAFIS corre aislado en la red privada;
 * igualdad de bytes queda disponible solamente para tests y FakeSensor.
 */
@Module({
  imports: [AuditModule, AccessModule, AgentsModule],
  controllers: [MemberBiometricsController, BiometricsController, AgentBiometricsController],
  providers: [
    BiometricsService,
    BiometricCryptoService,
    {
      provide: BIOMETRIC_MATCHER,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const url = config.env.BIOMETRIC_MATCHER_URL;
        const token = config.env.BIOMETRIC_MATCHER_TOKEN;
        if (url && token) return new HttpSourceAfisMatcher(url, token);
        if (url || token)
          throw new Error(
            'BIOMETRIC_MATCHER_URL y BIOMETRIC_MATCHER_TOKEN deben configurarse juntos.',
          );
        return new TemplateEqualityMatcher();
      },
    },
  ],
  exports: [BiometricsService, BiometricCryptoService],
})
export class BiometricsModule {}
