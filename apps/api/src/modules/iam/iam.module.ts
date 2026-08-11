import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { RoleController } from './role.controller.js';
import { RoleService } from './role.service.js';

/**
 * T-2.6 — API_CONTRACTS §5 "IAM": usuarios y roles.
 *
 * Importa `AuthModule` por `PasswordService` (genera la contraseña temporal
 * de alta y de reset — nunca la elige el cliente).
 */
@Module({
  imports: [AuthModule],
  controllers: [UserController, RoleController],
  providers: [UserService, RoleService],
  exports: [UserService, RoleService],
})
export class IamModule {}
