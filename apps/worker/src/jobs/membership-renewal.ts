import { monthlyEndDate, nextMonthlyDate, toBusinessDate } from '@pulso/config';
import { Prisma, tenantExtension, type PrismaClient } from '@pulso/db';
import type { Logger } from 'pino';

export interface RenewalDeps {
  prisma: PrismaClient;
  logger: Logger;
  now?: Date;
}

export interface RenewalResult {
  membershipsRenewed: number;
  recurrencesStopped: number;
  pastPeriodsSkipped: number;
  failures: number;
}

/** Creates debt only. Each member and predecessor are locked in that order.
 * The unique predecessor key remains the final guarantee against duplicates.
 */
export async function renewMemberships({
  prisma,
  logger,
  now = new Date(),
}: RenewalDeps): Promise<RenewalResult> {
  const result: RenewalResult = {
    membershipsRenewed: 0,
    recurrencesStopped: 0,
    pastPeriodsSkipped: 0,
    failures: 0,
  };
  // Platform discovery only. Every operational read/write below has a tenant
  // resolver from this trusted branch record, never from an external payload.
  const branches = await prisma.branch.findMany({
    select: { id: true, gymId: true, timezone: true },
  });
  for (const branch of branches) {
    const db = prisma.$extends(tenantExtension(() => branch.gymId));
    const today = toBusinessDate(now, branch.timezone);
    const candidates = await db.membership.findMany({
      where: { branchId: branch.id, autoRenew: true },
      select: { id: true, memberId: true },
    });
    for (const candidate of candidates) {
      try {
        const outcome = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "members"
            WHERE "id" = ${candidate.memberId}::uuid AND "gymId" = ${branch.gymId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "memberships"
            WHERE "id" = ${candidate.id}::uuid AND "gymId" = ${branch.gymId}::uuid FOR UPDATE`;
          const previous = await tx.membership.findFirst({ where: { id: candidate.id } });
          if (!previous?.autoRenew) return null;

          await tx.$queryRaw`SELECT "id" FROM "plans"
            WHERE "id" = ${previous.planId}::uuid AND "gymId" = ${branch.gymId}::uuid FOR SHARE`;
          await tx.$queryRaw`SELECT "id" FROM "branches"
            WHERE "id" = ${branch.id}::uuid AND "gymId" = ${branch.gymId}::uuid FOR SHARE`;
          const member = await tx.member.findFirst({ where: { id: previous.memberId } });
          const plan = await tx.plan.findFirst({ where: { id: previous.planId } });
          const currentBranch = await tx.branch.findFirst({ where: { id: branch.id } });
          const successor = await tx.membership.findFirst({
            where: {
              memberId: previous.memberId,
              id: { not: previous.id },
              OR: [{ renewedFromId: previous.id }, { startDate: { gt: previous.startDate } }],
            },
          });
          if (
            !member ||
            member.status !== 'ACTIVE' ||
            member.deletedAt ||
            !plan?.isActive ||
            plan.deletedAt ||
            plan.billingCycle !== 'MONTHLY' ||
            !currentBranch?.isActive ||
            currentBranch.deletedAt ||
            successor ||
            !['ACTIVE', 'EXPIRED'].includes(previous.status) ||
            !previous.endDate ||
            !previous.nextRenewalDate ||
            !previous.renewalAnchorDay
          ) {
            await tx.membership.update({
              where: { id: previous.id },
              data: {
                autoRenew: false,
                nextRenewalDate: null,
              },
            });
            await tx.auditEvent.create({
              data: {
                gymId: branch.gymId,
                branchId: branch.id,
                actorType: 'SYSTEM',
                action: 'MEMBERSHIP_RENEWAL_STOPPED',
                resourceType: 'Membership',
                resourceId: previous.id,
                after: { autoRenew: false, reason: 'INELIGIBLE_OR_SUPERSEDED' },
              },
            });
            return { stopped: true, skipped: 0 };
          }

          let start = previous.nextRenewalDate.toISOString().slice(0, 10);
          if (start > today) return null;
          let next = nextMonthlyDate(start, previous.renewalAnchorDay);
          let skipped = 0;
          // Never produce a backlog: only the period covering the business day
          // is generated, even after a prolonged worker outage.
          while (next <= today) {
            start = next;
            next = nextMonthlyDate(start, previous.renewalAnchorDay);
            skipped += 1;
          }
          const end = monthlyEndDate(start, previous.renewalAnchorDay);
          if (plan.price.lte(0))
            throw new Error('La renovacion requiere un precio de plan positivo.');

          await tx.membership.update({
            where: { id: previous.id },
            data: {
              status: 'EXPIRED',
              autoRenew: false,
              nextRenewalDate: null,
            },
          });
          const period = await tx.membership.create({
            data: {
              gymId: branch.gymId,
              branchId: branch.id,
              memberId: member.id,
              planId: plan.id,
              status: 'ACTIVE',
              startDate: new Date(start),
              endDate: new Date(end),
              pricePaid: plan.price,
              classesIncluded: plan.classesIncluded,
              classesRemaining: plan.classesIncluded,
              autoRenew: true,
              renewalAnchorDay: previous.renewalAnchorDay,
              nextRenewalDate: new Date(next),
              renewedFromId: previous.id,
            },
          });
          const balance = new Prisma.Decimal(member.balance).minus(plan.price);
          await tx.ledgerEntry.create({
            data: {
              gymId: branch.gymId,
              branchId: branch.id,
              memberId: member.id,
              membershipId: period.id,
              type: 'DEBIT',
              reason: 'MEMBERSHIP_CHARGE',
              amount: plan.price,
              balanceAfter: balance,
              description: `Renovacion mensual: ${plan.name} (${start} - ${end})`,
            },
          });
          await tx.member.update({ where: { id: member.id }, data: { balance } });
          await tx.auditEvent.create({
            data: {
              gymId: branch.gymId,
              branchId: branch.id,
              actorType: 'SYSTEM',
              action: 'MEMBERSHIP_RENEWED',
              resourceType: 'Membership',
              resourceId: period.id,
              after: {
                renewedFromId: previous.id,
                startDate: start,
                endDate: end,
                nextRenewalDate: next,
                pricePaid: plan.price.toFixed(2),
                mode: 'DEBT',
                pastPeriodsSkipped: skipped,
              },
            },
          });
          return { stopped: false, skipped };
        });
        if (outcome?.stopped) result.recurrencesStopped += 1;
        if (outcome && !outcome.stopped) result.membershipsRenewed += 1;
        result.pastPeriodsSkipped += outcome?.skipped ?? 0;
      } catch (err) {
        // A bad period must not prevent unrelated members from renewing.
        result.failures += 1;
        logger.error(
          { err, membershipId: candidate.id, gymId: branch.gymId },
          'Fallo la renovacion mensual',
        );
      }
    }
  }
  return result;
}
