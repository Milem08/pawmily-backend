import { DomainError } from '../../domain/shared/DomainError';
import { AuthActor } from '../access/authorizePatientAction';
import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';

const MAX_FAVORITES = 3;

async function userCanAccessPatient(
  actor: AuthActor,
  patient: { id: string; vetId: string; ownerUserId: string | null },
): Promise<boolean> {
  if (actor.role === 'vet' && patient.vetId === actor.id) return true;
  if (actor.role === 'owner' && patient.ownerUserId === actor.id) return true;
  const grant = await prisma.patientAccess.findFirst({
    where: {
      userId: actor.id,
      patientId: patient.id,
      status: 'ACTIVE',
      revokedAt: null,
    },
    select: { id: true },
  });
  return Boolean(grant);
}

async function assertFavoriteTarget(
  actor: AuthActor,
  input: { targetType: 'REMINDER' | 'APPOINTMENT'; targetId: string },
): Promise<void> {
  if (input.targetType === 'REMINDER') {
    const rem = await prisma.reminder.findUnique({
      where: { id: input.targetId },
      include: { pet: { select: { id: true, vetId: true, ownerUserId: true } } },
    });
    if (!rem || !(await userCanAccessPatient(actor, rem.pet))) {
      throw new DomainError('Recordatorio no encontrado', 404);
    }
    return;
  }
  const appt = await prisma.appointment.findUnique({
    where: { id: input.targetId },
    include: { patient: { select: { id: true, vetId: true, ownerUserId: true } } },
  });
  if (!appt) throw new DomainError('Cita no encontrada', 404);
  const allowed = appt.patient
    ? await userCanAccessPatient(actor, appt.patient)
    : actor.role === 'vet' && appt.vetId === actor.id;
  if (!allowed) throw new DomainError('Cita no encontrada', 404);
}

export class ListFavorites {
  async execute(actor: AuthActor) {
    return prisma.userFavorite.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class AddFavorite {
  async execute(
    actor: AuthActor,
    input: { targetType: 'REMINDER' | 'APPOINTMENT'; targetId: string },
  ) {
    await assertFavoriteTarget(actor, input);

    const count = await prisma.userFavorite.count({ where: { userId: actor.id } });
    if (count >= MAX_FAVORITES) {
      throw new DomainError('Ya alcanzaste el máximo de 3 favoritos', 409);
    }
    const existing = await prisma.userFavorite.findUnique({
      where: {
        userId_targetType_targetId: {
          userId: actor.id,
          targetType: input.targetType,
          targetId: input.targetId,
        },
      },
    });
    if (existing) return existing;

    return prisma.userFavorite.create({
      data: {
        userId: actor.id,
        targetType: input.targetType,
        targetId: input.targetId,
      },
    });
  }
}

export class RemoveFavorite {
  async execute(actor: AuthActor, id: string) {
    const fav = await prisma.userFavorite.findUnique({ where: { id } });
    if (!fav || fav.userId !== actor.id) {
      throw new DomainError('Favorito no encontrado', 404);
    }
    await prisma.userFavorite.delete({ where: { id } });
  }
}
