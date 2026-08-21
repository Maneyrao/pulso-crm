import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AccessModule } from '../access/access.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { BiometricCryptoService } from './biometric-crypto.service.js';
import { BIOMETRIC_MATCHER, TemplateEqualityMatcher } from './biometric-matcher.js';
import {
  AgentBiometricsController,
  BiometricsController,
  MemberBiometricsController,
} from './biometrics.controller.js';
import { BiometricsService } from './biometrics.service.js';

/**
 * Biometría (Etapas 7-8): consentimiento, enrolamiento, credenciales
 * cifradas e identificación 1:N. El matcher es un provider swappeable —
 * igualdad de bytes hasta que llegue el SDK real de DigitalPersona.
 */
@Module({
  imports: [AuditModule, AccessModule, AgentsModule],
  controllers: [MemberBiometricsController, BiometricsController, AgentBiometricsController],
  providers: [
    BiometricsService,
    BiometricCryptoService,
    { provide: BIOMETRIC_MATCHER, useClass: TemplateEqualityMatcher },
  ],
  exports: [BiometricsService, BiometricCryptoService],
})
export class BiometricsModule {}
