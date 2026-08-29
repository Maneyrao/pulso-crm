import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type AgentEnrollCompleteRequest,
  agentEnrollCompleteRequestSchema,
  type AgentIdentifyRequest,
  agentIdentifyRequestSchema,
  type CompleteHidEnrollmentRequest,
  completeHidEnrollmentRequestSchema,
  type GrantConsentRequest,
  grantConsentRequestSchema,
  type IdentifyHidRequest,
  identifyHidRequestSchema,
  type StartEnrollmentRequest,
  startEnrollmentRequestSchema,
  type StartIdentificationRequest,
  startIdentificationRequestSchema,
  type StartHidEnrollmentRequest,
  startHidEnrollmentRequestSchema,
} from '@pulso/contracts/biometrics';
import { uuidSchema } from '@pulso/contracts/common';
import { AgentOnly, RequiresPermission } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { ZodBody, ZodParam } from '../../common/validation/zod.pipe.js';
import { AgentAuth, type AgentAuthInfo } from '../agents/agent-auth.service.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { BiometricsService } from './biometrics.service.js';

/** Superficie CRM anclada al socio (API_CONTRACTS.md §10). */
@Controller('members/:id/biometrics')
export class MemberBiometricsController {
  constructor(private readonly biometrics: BiometricsService) {}

  @RequiresPermission('biometrics:enroll')
  @Post('consent')
  grantConsent(
    @ZodParam('id', uuidSchema) memberId: string,
    @ZodBody(grantConsentRequestSchema) body: GrantConsentRequest,
  ) {
    return this.biometrics.grantConsent(memberId, body);
  }

  /** Revoca consentimiento Y credenciales en la misma transacción. */
  @RequiresPermission('biometrics:revoke')
  @Delete('consent')
  revokeConsent(@ZodParam('id', uuidSchema) memberId: string) {
    return this.biometrics.revokeConsent(memberId);
  }

  @RequiresPermission('biometrics:enroll')
  @Idempotent()
  @Post('enrollments')
  startEnrollment(
    @ZodParam('id', uuidSchema) memberId: string,
    @ZodBody(startEnrollmentRequestSchema) body: StartEnrollmentRequest,
  ) {
    return this.biometrics.startEnrollment(memberId, body);
  }

  @RequiresPermission('biometrics:enroll')
  @Idempotent()
  @Post('hid-enrollments')
  startHidEnrollment(
    @ZodParam('id', uuidSchema) memberId: string,
    @ZodBody(startHidEnrollmentRequestSchema) body: StartHidEnrollmentRequest,
  ) {
    return this.biometrics.startHidEnrollment(memberId, body);
  }

  @RequiresPermission('biometrics:read')
  @Get('credentials')
  credentials(@ZodParam('id', uuidSchema) memberId: string) {
    return this.biometrics.listMemberCredentials(memberId);
  }
}

/** Superficie CRM por id de enrolamiento/credencial. */
@Controller('biometrics')
export class BiometricsController {
  constructor(private readonly biometrics: BiometricsService) {}

  @RequiresPermission('access:operate')
  @Idempotent()
  @Post('identifications')
  startIdentification(@ZodBody(startIdentificationRequestSchema) body: StartIdentificationRequest) {
    return this.biometrics.startIdentification(body);
  }

  @RequiresPermission('access:operate')
  @Idempotent()
  @Post('hid-identifications')
  identifyHid(@ZodBody(identifyHidRequestSchema) body: IdentifyHidRequest) {
    return this.biometrics.identifyHid(body);
  }

  @RequiresPermission('biometrics:read')
  @Get('enrollments/:id')
  enrollment(@ZodParam('id', uuidSchema) id: string) {
    return this.biometrics.getEnrollment(id);
  }

  @RequiresPermission('biometrics:enroll')
  @Post('enrollments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelEnrollment(@ZodParam('id', uuidSchema) id: string) {
    return this.biometrics.cancelEnrollment(id);
  }

  @RequiresPermission('biometrics:enroll')
  @Post('hid-enrollments/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeHidEnrollment(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(completeHidEnrollmentRequestSchema) body: CompleteHidEnrollmentRequest,
  ) {
    return this.biometrics.completeHidEnrollment(id, body);
  }

  @RequiresPermission('biometrics:revoke')
  @Delete('credentials/:id')
  revokeCredential(@ZodParam('id', uuidSchema) id: string) {
    return this.biometrics.revokeCredential(id);
  }
}

/**
 * Superficie del agente (`Bearer <deviceToken>`). La respuesta de identify es
 * `{resolved:true}` y NADA más: el agente jamás recibe la identidad del socio.
 */
@Controller('agent/biometrics')
export class AgentBiometricsController {
  constructor(private readonly biometrics: BiometricsService) {}

  @AgentOnly()
  @Post('enroll-complete')
  @HttpCode(HttpStatus.OK)
  enrollComplete(
    @AgentAuth() auth: AgentAuthInfo,
    @ZodBody(agentEnrollCompleteRequestSchema) body: AgentEnrollCompleteRequest,
  ) {
    return this.biometrics.enrollComplete(auth, body);
  }

  @AgentOnly()
  @Post('identify')
  @HttpCode(HttpStatus.OK)
  identify(
    @AgentAuth() auth: AgentAuthInfo,
    @ZodBody(agentIdentifyRequestSchema) body: AgentIdentifyRequest,
  ) {
    return this.biometrics.identify(auth, body);
  }
}
