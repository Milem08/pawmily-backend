import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';

export type ClinicMessageType =
  | 'prescription'
  | 'appointment_request'
  | 'appointment_update'
  | 'general';

export type ClinicMessageDto = {
  id: string;
  userId: string;
  patientId: string | null;
  type: string;
  title: string;
  body: string;
  payload: unknown;
  readAt: string | null;
  createdAt: string;
};

function mapMessage(row: {
  id: string;
  userId: string;
  patientId: string | null;
  type: string;
  title: string;
  body: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): ClinicMessageDto {
  return {
    id: row.id,
    userId: row.userId,
    patientId: row.patientId,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.payload ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createClinicMessage(data: {
  userId: string;
  patientId?: string | null;
  type: ClinicMessageType | string;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
}): Promise<ClinicMessageDto> {
  const row = await prisma.clinicMessage.create({
    data: {
      userId: data.userId,
      patientId: data.patientId ?? null,
      type: data.type,
      title: data.title,
      body: data.body,
      ...(data.payload ? { payload: data.payload as object } : {}),
    },
  });
  return mapMessage(row);
}

/** Notify all active accessors + primary ownerUserId for a patient. */
export async function notifyPatientOwners(
  accesses: PatientAccessRepository,
  patientId: string,
  ownerUserId: string | null | undefined,
  data: {
    type: ClinicMessageType | string;
    title: string;
    body: string;
    payload?: Record<string, unknown> | null;
  },
): Promise<number> {
  const recipients = new Set<string>();
  if (ownerUserId) recipients.add(ownerUserId);
  const grants = await accesses.listActiveForPatient(patientId);
  for (const g of grants) recipients.add(g.userId);

  let created = 0;
  for (const userId of recipients) {
    await createClinicMessage({
      userId,
      patientId,
      type: data.type,
      title: data.title,
      body: data.body,
      payload: data.payload,
    });
    created += 1;
  }
  return created;
}

export async function listClinicMessagesForUser(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<ClinicMessageDto[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await prisma.clinicMessage.findMany({
    where: {
      userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(mapMessage);
}

export async function markClinicMessageRead(
  userId: string,
  messageId: string,
): Promise<ClinicMessageDto | null> {
  const existing = await prisma.clinicMessage.findFirst({
    where: { id: messageId, userId },
  });
  if (!existing) return null;
  if (existing.readAt) return mapMessage(existing);
  const row = await prisma.clinicMessage.update({
    where: { id: messageId },
    data: { readAt: new Date() },
  });
  return mapMessage(row);
}

export async function markAllClinicMessagesRead(userId: string): Promise<number> {
  const result = await prisma.clinicMessage.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}
