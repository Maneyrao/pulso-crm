import { Injectable } from '@nestjs/common';
import { type Prisma, type Member, scoped } from '@pulso/db';
import type {
  CreateMemberRequest,
  DeactivateMemberRequest,
  DebtorListItem,
  GetMemberLedgerResponse,
  ListDebtorsQuery,
  ListDebtorsResponse,
  ListMemberPaymentsQuery,
  ListMemberPaymentsResponse,
  ListMembersQuery,
  ListMembersResponse,
  MemberDetail,
  MemberListItem,
  UpdateMemberRequest,
} from '@pulso/contracts/members';
import { normalizeDocument } from '@pulso/config/document';
import { normalizePhone } from '@pulso/config/phone';
import { endOfBusinessDayExclusive, startOfBusinessDay } from '@pulso/config/time';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { fromDateOnly, toDateOnly } from './date-only.js';
import { isUniqueViolation, uniqueViolationTarget } from './db-errors.js';
import { maskedDocument, serializeMember, type MemberDto } from './member-serializer.js';
import { nextMemberNumber } from './member-counter.js';

const READ_DOCUMENT_PERMISSION = 'member:read_document';

/** Fila de socio con las relaciones que necesita un ítem de listado. */
interface MemberListRow {
  id: string;
  memberNumber: number;
  firstName: string;
  lastName: string;
  documentNumber: string;
  phone: string | null;
  status: Member['status'];
  balance: Prisma.Decimal;
  branch: { id: string; name: string } | null;
  memberships: {
    endDate: Date | null;
    classesRemaining: number | null;
    plan: { name: string };
  }[];
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── GET /members ──────────────────────────────────────────────────────────

  async list(query: ListMembersQuery): Promise<ListMembersResponse> {
    const where = this.buildListWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.client.member.findMany({
        where,
        orderBy: this.orderByFor(query.sort, query.order),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          branch: { select: { id: true, name: true } },
          memberships: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: { select: { name: true } } },
          },
        },
      }),
      this.prisma.client.member.count({ where }),
    ]);

    const canReadDocument = this.canReadDocument();
    return {
      data: rows.map((row) => this.toListItem(row, canReadDocument)),
      pageInfo: {
        limit: query.limit,
        page: query.page,
        total,
        hasMore: query.page * query.limit < total,
      },
    };
  }

  // ── POST /members ─────────────────────────────────────────────────────────

  async create(input: CreateMemberRequest): Promise<MemberDto> {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);

    const normalizedDocument = normalizeDocument(input.documentNumber);
    const normalizedPhone = this.normalizePhoneOrThrow(input.phone);

    try {
      const member = await this.prisma.client.$transaction(async (tx) => {
        // Correlativo por gimnasio con SELECT ... FOR UPDATE: nunca MAX()+1
        // (regla no negociable — se rompe bajo concurrencia).
        const memberNumber = await nextMemberNumber(tx, ctx.gymId);

        const created = await tx.member.create({
          data: scoped({
            memberNumber,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            documentType: input.documentType,
            documentNumber: normalizedDocument,
            email: input.email ? input.email.trim().toLowerCase() : null,
            phone: normalizedPhone,
            birthDate: input.birthDate ? fromDateOnly(input.birthDate) : null,
            gender: input.gender ?? null,
            address: input.address ?? null,
            cardCode: input.cardCode ?? null,
            notes: input.notes ?? null,
            branchId,
          }),
        });

        await this.audit.recordIn(tx, {
          action: 'MEMBER_CREATED',
          resourceType: 'Member',
          resourceId: created.id,
          after: created,
          branchId,
        });

        return created;
      });

      return serializeMember(member, this.canReadDocument());
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  // ── GET /members/:id ──────────────────────────────────────────────────────

  async getById(id: string): Promise<MemberDetail> {
    const member = await this.prisma.client.member.findFirst({
      where: { id, deletedAt: null },
      include: {
        memberships: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { plan: { select: { name: true } } },
        },
        cashMovements: {
          where: { type: 'INCOME', reversalOfId: null, isReversed: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { paymentMethod: { select: { name: true } } },
        },
      },
    });
    if (!member) throw AppError.notFound('El socio');

    const canReadDocument = this.canReadDocument();
    return {
      ...serializeMember(member, canReadDocument),
      balance: member.balance.toFixed(2),
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
      recentMemberships: member.memberships.map((m) => ({
        id: m.id,
        planId: m.planId,
        planName: m.plan.name,
        status: m.status,
        startDate: toDateOnly(m.startDate),
        endDate: toDateOnly(m.endDate),
        classesRemaining: m.classesRemaining,
      })),
      recentPayments: member.cashMovements.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        paymentMethodName: payment.paymentMethod.name,
        createdAt: payment.createdAt.toISOString(),
      })),
      recentAttendances: [],
    };
  }

  // ── PATCH /members/:id ────────────────────────────────────────────────────

  async update(id: string, input: UpdateMemberRequest): Promise<MemberDto> {
    const existing = await this.prisma.client.member.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound('El socio');

    const patch: Partial<Member> = {};
    if (input.firstName !== undefined) patch.firstName = input.firstName.trim();
    if (input.lastName !== undefined) patch.lastName = input.lastName.trim();
    if (input.email !== undefined)
      patch.email = input.email ? input.email.trim().toLowerCase() : null;
    if (input.phone !== undefined) {
      patch.phone = input.phone === null ? null : this.normalizePhoneOrThrow(input.phone);
    }
    if (input.birthDate !== undefined) {
      patch.birthDate = input.birthDate ? fromDateOnly(input.birthDate) : null;
    }
    if (input.gender !== undefined) patch.gender = input.gender;
    if (input.address !== undefined) patch.address = input.address;
    if (input.cardCode !== undefined) patch.cardCode = input.cardCode;
    if (input.branchId !== undefined) {
      patch.branchId =
        input.branchId === null ? null : TenantContextStore.requireBranch(input.branchId);
    }
    if (input.medicalClearanceUntil !== undefined) {
      patch.medicalClearanceUntil = input.medicalClearanceUntil
        ? fromDateOnly(input.medicalClearanceUntil)
        : null;
    }
    if (input.emergencyContactName !== undefined)
      patch.emergencyContactName = input.emergencyContactName;
    if (input.emergencyContactPhone !== undefined)
      patch.emergencyContactPhone = input.emergencyContactPhone;
    if (input.notes !== undefined) patch.notes = input.notes;

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.member.update({
          where: { id },
          data: patch as Prisma.MemberUpdateInput,
        });

        const { before, after } = diff(existing, patch);
        await this.audit.recordIn(tx, {
          action: 'MEMBER_UPDATED',
          resourceType: 'Member',
          resourceId: id,
          before,
          after,
          branchId: row.branchId,
        });

        return row;
      });

      return serializeMember(updated, this.canReadDocument());
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  // ── POST /members/:id/deactivate ──────────────────────────────────────────

  async deactivate(id: string, input: DeactivateMemberRequest): Promise<MemberDto> {
    const existing = await this.prisma.client.member.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound('El socio');

    if (existing.balance.lt(0) && !input.force) {
      throw AppError.conflict(
        ErrorCode.MEMBER_HAS_DEBT,
        'El socio tiene saldo deudor. Repetí la baja con force: true y un motivo, o saldá la deuda antes.',
        { balance: existing.balance.toFixed(2) },
      );
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.member.update({
        where: { id },
        data: {
          status: 'INACTIVE',
          deactivatedAt: new Date(),
          deactivatedReason: input.reason ?? null,
        },
      });

      await this.audit.recordIn(tx, {
        action: 'MEMBER_DEACTIVATED',
        resourceType: 'Member',
        resourceId: id,
        before: { status: existing.status },
        after: { status: row.status, reason: input.reason ?? null, forced: input.force },
        branchId: row.branchId,
      });

      return row;
    });

    return serializeMember(updated, this.canReadDocument());
  }

  // ── GET /members/:id/ledger ───────────────────────────────────────────────

  async getLedger(id: string): Promise<GetMemberLedgerResponse> {
    const member = await this.prisma.client.member.findFirst({ where: { id, deletedAt: null } });
    if (!member) throw AppError.notFound('El socio');

    const entries = await this.prisma.client.ledgerEntry.findMany({
      where: { memberId: id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      balance: member.balance.toFixed(2),
      entries: entries.map((e) => ({
        id: e.id,
        memberId: e.memberId,
        type: e.type,
        reason: e.reason,
        amount: e.amount.toFixed(2),
        balanceAfter: e.balanceAfter.toFixed(2),
        description: e.description,
        membershipId: e.membershipId,
        cashMovementId: e.cashMovementId,
        reversalOfId: e.reversalOfId,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // ── GET /members/:id/payments ────────────────────────────────────────────

  async getPayments(
    id: string,
    query: ListMemberPaymentsQuery,
  ): Promise<ListMemberPaymentsResponse> {
    const member = await this.prisma.client.member.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!member) throw AppError.notFound('El socio');

    const baseWhere = {
      memberId: id,
      type: 'INCOME' as const,
      reversalOfId: null,
    };
    const skip = (query.page - 1) * query.limit;

    const [rows, total, validSummary, lastPayment] = await Promise.all([
      this.prisma.client.cashMovement.findMany({
        where: baseWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
        include: {
          cashSession: { select: { businessDate: true } },
          paymentMethod: { select: { id: true, code: true, name: true } },
          cashConcept: { select: { id: true, code: true, name: true } },
          membership: {
            select: { id: true, plan: { select: { name: true } } },
          },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.client.cashMovement.count({ where: baseWhere }),
      this.prisma.client.cashMovement.aggregate({
        where: { ...baseWhere, isReversed: false },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.client.cashMovement.findFirst({
        where: { ...baseWhere, isReversed: false },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
    ]);

    return {
      data: rows.map((payment) => ({
        id: payment.id,
        amount: payment.amount.toFixed(2),
        paidOn: toDateOnly(payment.cashSession.businessDate),
        createdAt: payment.createdAt.toISOString(),
        description: payment.description,
        status: payment.isReversed ? ('REVERSED' as const) : ('VALID' as const),
        reversalReason: payment.reversalReason,
        paymentMethod: payment.paymentMethod,
        concept: payment.cashConcept,
        membership: payment.membership
          ? { id: payment.membership.id, planName: payment.membership.plan.name }
          : null,
        registeredBy: {
          id: payment.createdBy.id,
          fullName: `${payment.createdBy.firstName} ${payment.createdBy.lastName}`.trim(),
        },
      })),
      pageInfo: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: skip + rows.length < total,
      },
      summary: {
        paymentCount: validSummary._count._all,
        totalPaid: validSummary._sum.amount?.toFixed(2) ?? '0.00',
        lastPaymentAt: lastPayment?.createdAt.toISOString() ?? null,
      },
    };
  }

  // ── GET /members/debtors ──────────────────────────────────────────────────

  async listDebtors(query: ListDebtorsQuery): Promise<ListDebtorsResponse> {
    const where: Prisma.MemberWhereInput = {
      deletedAt: null,
      balance: { lt: 0 },
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.member.findMany({
        where,
        orderBy: query.sort === 'balance' ? { balance: query.order } : { updatedAt: query.order },
        include: {
          branch: { select: { id: true, name: true } },
          memberships: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { plan: { select: { name: true } } },
          },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.client.member.count({ where }),
    ]);

    const canReadDocument = this.canReadDocument();
    const data: DebtorListItem[] = await Promise.all(
      rows.map(async (row) => ({
        ...this.toListItem(row, canReadDocument),
        debtSince: await this.computeDebtSince(row.id),
      })),
    );

    // `debtAge` (antigüedad de deuda) es una columna derivada del ledger, no de
    // la tabla: se ordena en memoria sobre la página ya traída. Para el
    // volumen esperado de deudores (cientos, no millones) es aceptable.
    if (query.sort === 'debtAge') {
      data.sort((a, b) => {
        const left = a.debtSince ?? '';
        const right = b.debtSince ?? '';
        const cmp = left.localeCompare(right);
        return query.order === 'asc' ? cmp : -cmp;
      });
    }

    return {
      data,
      pageInfo: {
        limit: query.limit,
        page: query.page,
        total,
        hasMore: query.page * query.limit < total,
      },
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private canReadDocument(): boolean {
    return TenantContextStore.require().permissions.has(READ_DOCUMENT_PERMISSION);
  }

  private normalizePhoneOrThrow(phone: string | undefined): string | null {
    if (!phone) return null;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      throw AppError.validation([
        {
          field: 'phone',
          code: 'invalid_phone',
          message: 'El teléfono no tiene un formato reconocible.',
        },
      ]);
    }
    return normalized;
  }

  private buildListWhere(query: ListMembersQuery): Prisma.MemberWhereInput {
    const where: Prisma.MemberWhereInput = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.branchId) where.branchId = query.branchId;
    if (query.hasDebt) where.balance = { lt: 0 };

    if (query.q) {
      const q = query.q.trim();
      const normalizedDoc = normalizeDocument(q);
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { documentNumber: { contains: normalizedDoc, mode: 'insensitive' } },
      ];
    }

    // `planId` implica "tiene ese plan activo hoy"; `membershipStatus` filtra
    // por el estado de la membresía. Se combinan en el mismo `some` cuando
    // aparecen juntos.
    if (query.planId || query.membershipStatus === 'ACTIVE') {
      where.memberships = {
        some: { status: 'ACTIVE', ...(query.planId ? { planId: query.planId } : {}) },
      };
    } else if (query.membershipStatus === 'EXPIRED') {
      where.memberships = { some: { status: 'EXPIRED' } };
    } else if (query.membershipStatus === 'NONE') {
      where.memberships = { none: { status: 'ACTIVE' } };
    }

    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: startOfBusinessDay(query.createdFrom) } : {}),
        ...(query.createdTo ? { lt: endOfBusinessDayExclusive(query.createdTo) } : {}),
      };
    }

    return where;
  }

  private orderByFor(
    sort: ListMembersQuery['sort'],
    order: ListMembersQuery['order'],
  ): Prisma.MemberOrderByWithRelationInput {
    switch (sort) {
      case 'firstName':
        return { firstName: order };
      case 'lastName':
        return { lastName: order };
      case 'createdAt':
        return { createdAt: order };
      case 'memberNumber':
        return { memberNumber: order };
      case 'balance':
        return { balance: order };
    }
  }

  private toListItem(row: MemberListRow, canReadDocument: boolean): MemberListItem {
    const activeMembership = row.memberships[0];
    return {
      id: row.id,
      memberNumber: row.memberNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      documentMasked: maskedDocument(row.documentNumber, canReadDocument),
      phone: row.phone,
      status: row.status,
      branch: row.branch ? { id: row.branch.id, name: row.branch.name } : null,
      activeMembership: activeMembership
        ? {
            planName: activeMembership.plan.name,
            endDate: toDateOnly(activeMembership.endDate),
            classesRemaining: activeMembership.classesRemaining,
          }
        : null,
      balance: row.balance.toFixed(2),
      // No hay integración de storage en este alcance (Etapa de fotos/documentos
      // no implementada): siempre null hasta que exista ese módulo.
      photoUrl: null,
    };
  }

  private async computeDebtSince(memberId: string): Promise<string | null> {
    const lastNonNegative = await this.prisma.client.ledgerEntry.findFirst({
      where: { memberId, balanceAfter: { gte: 0 } },
      orderBy: { createdAt: 'desc' },
    });
    const earliestDebit = await this.prisma.client.ledgerEntry.findFirst({
      where: {
        memberId,
        type: 'DEBIT',
        ...(lastNonNegative ? { createdAt: { gt: lastNonNegative.createdAt } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return earliestDebit ? toDateOnly(earliestDebit.createdAt) : null;
  }

  private translateWriteError(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      const target = uniqueViolationTarget(err);
      if (target.includes('document')) {
        return AppError.conflict(
          ErrorCode.DUPLICATE_DOCUMENT,
          'Ya existe un socio con ese documento en este gimnasio.',
        );
      }
      if (target.includes('card')) {
        return AppError.conflict(
          ErrorCode.DUPLICATE_CARD,
          'Esa tarjeta ya está asignada a otro socio.',
        );
      }
    }
    return err;
  }
}

export type { MemberDto } from './member-serializer.js';
