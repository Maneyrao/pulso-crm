import type { Gender, Member as PrismaMember, MemberStatus, DocumentType } from '@pulso/db';
import { maskDocument } from '@pulso/config/document';
import { toDateOnly } from './date-only.js';

/**
 * Enmascaramiento de documento (ADR-018): ocurre ACÁ, en el backend, nunca en
 * el frontend. `member:read_document` es el único permiso que destapa el
 * valor completo.
 */
export interface MemberDto {
  id: string;
  gymId: string;
  memberNumber: number;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: Gender | null;
  address: string | null;
  cardCode: string | null;
  photoKey: string | null;
  status: MemberStatus;
  branchId: string | null;
  balance: PrismaMember['balance'];
  medicalClearanceUntil: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeMember(member: PrismaMember, canReadDocument: boolean): MemberDto {
  return {
    id: member.id,
    gymId: member.gymId,
    memberNumber: member.memberNumber,
    firstName: member.firstName,
    lastName: member.lastName,
    documentType: member.documentType,
    documentNumber: canReadDocument ? member.documentNumber : maskDocument(member.documentNumber),
    email: member.email,
    phone: member.phone,
    birthDate: toDateOnly(member.birthDate),
    gender: member.gender,
    address: member.address,
    cardCode: member.cardCode,
    photoKey: member.photoKey,
    status: member.status,
    branchId: member.branchId,
    balance: member.balance,
    medicalClearanceUntil: toDateOnly(member.medicalClearanceUntil),
    emergencyContactName: member.emergencyContactName,
    emergencyContactPhone: member.emergencyContactPhone,
    notes: member.notes,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

/** Documento SIEMPRE enmascarado en listados, salvo el permiso (ADR-018). */
export function maskedDocument(documentNumber: string, canReadDocument: boolean): string {
  return canReadDocument ? documentNumber : maskDocument(documentNumber);
}
