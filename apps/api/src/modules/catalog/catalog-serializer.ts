import type { Activity as PrismaActivity, Plan as PrismaPlan } from '@pulso/db';

export interface ActivityDto {
  id: string;
  gymId: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeActivity(activity: PrismaActivity): ActivityDto {
  return {
    id: activity.id,
    gymId: activity.gymId,
    name: activity.name,
    description: activity.description,
    color: activity.color,
    isActive: activity.isActive,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

export interface PlanDto {
  id: string;
  gymId: string;
  name: string;
  description: string | null;
  price: PrismaPlan['price'];
  billingCycle: PrismaPlan['billingCycle'];
  durationDays: number | null;
  classesIncluded: number | null;
  weeklyAccessLimit: number | null;
  isActive: boolean;
  activityIds: string[];
  branchIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function serializePlan(plan: PrismaPlan, activityIds: string[], branchIds: string[]): PlanDto {
  return {
    id: plan.id,
    gymId: plan.gymId,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    billingCycle: plan.billingCycle,
    durationDays: plan.durationDays,
    classesIncluded: plan.classesIncluded,
    weeklyAccessLimit: plan.weeklyAccessLimit,
    isActive: plan.isActive,
    activityIds,
    branchIds,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}
