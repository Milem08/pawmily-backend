import { DomainError } from '../../domain/shared/DomainError';
import { AuthActor } from '../access/authorizePatientAction';
import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';

const MAX_FAVORITES = 3;

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

    if (input.targetType === 'REMINDER') {
      const rem = await prisma.reminder.findUnique({ where: { id: input.targetId } });
      if (!rem) throw new DomainError('Recordatorio no encontrado', 404);
    } else {
      const appt = await prisma.appointment.findUnique({ where: { id: input.targetId } });
      if (!appt) throw new DomainError('Cita no encontrada', 404);
    }

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
