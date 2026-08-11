import type { User as PrismaUser } from '@pulso/db';
import type { User as UserDto } from '@pulso/contracts/iam';

/** `User` de Prisma con las relaciones que necesita `userSchema` (`roleIds`, `branchIds`). */
export interface UserWithAssignments extends PrismaUser {
  roleAssignments: { roleId: string }[];
  branchAccess: { branchId: string }[];
}

export function serializeUser(user: UserWithAssignments): UserDto {
  return {
    id: user.id,
    gymId: user.gymId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    roleIds: user.roleAssignments.map((a) => a.roleId),
    branchIds: user.branchAccess.map((a) => a.branchId),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
