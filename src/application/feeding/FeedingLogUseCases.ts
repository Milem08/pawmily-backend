import { DomainError } from '../../domain/shared/DomainError';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import { authorizePatientAction, AuthActor } from '../access/authorizePatientAction';
import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';
import { businessNow, addCalendarDays, isBusinessDate, todayInBusinessZone } from '../../shared/businessTime';
import { closeActionForMeal, summarizeFeeding } from './feedingSchedule';

type LogStatus = 'EATEN' | 'PENDING' | 'UNLOGGED' | 'PARTIAL';
type LogReason = 'NORMAL' | 'LESS' | 'REFUSED' | 'SKIPPED' | 'OTHER';

function zonedNow(): { iso: string; minutes: number } {
  const now = businessNow();
  return { iso: now.date, minutes: now.minutes };
}

function isoToday(): string {
  return zonedNow().iso;
}

function weekRange(anchor: string): { from: string; to: string; days: string[] } {
  const [year, month, dayOfMonth] = anchor.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = addCalendarDays(anchor, mondayOffset);
  const days = Array.from({ length: 7 }, (_, i) => addCalendarDays(monday, i));
  return { from: days[0], to: days[6], days };
}

function businessDateOr(value: string | undefined, fallback: string): string {
  return value && isBusinessDate(value) ? value : fallback;
}

export class ListFeedingLogs {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(
    actor: AuthActor,
    petId: string,
    range?: { from?: string; to?: string },
  ) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'READ');
    return prisma.feedingLog.findMany({
      where: {
        patientId: petId,
        ...(range?.from || range?.to
          ? {
              scheduledDate: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      include: { meal: true },
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
}

export class MarkFeedingLog {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(
    actor: AuthActor,
    petId: string,
    input: {
      mealId: string;
      scheduledDate: string;
      status: LogStatus;
      reason?: LogReason | null;
      notes?: string | null;
    },
  ) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'READ');
    if (!isBusinessDate(input.scheduledDate)) {
      throw new DomainError('La fecha debe tener el formato AAAA-MM-DD', 400);
    }
    if (input.scheduledDate > isoToday()) {
      throw new DomainError('No se puede registrar una comida en una fecha futura', 400);
    }
    const meal = await prisma.feedingMeal.findUnique({
      where: { id: input.mealId },
      include: { feeding: true },
    });
    if (!meal || meal.feeding.petId !== petId) {
      throw new DomainError('Comida no encontrada', 404);
    }
    const startDate = meal.feeding.startDate;
    if (startDate && isBusinessDate(startDate) && input.scheduledDate < startDate) {
      throw new DomainError('La fecha es anterior al inicio del plan', 400);
    }
    if (meal.archivedAt) {
      throw new DomainError('La comida ya no está en el plan', 400);
    }
    const planStatus = meal.feeding.status || 'ACTIVE';
    if (planStatus !== 'ACTIVE') {
      throw new DomainError('El plan de alimentación no está activo', 400);
    }

    const done = input.status === 'EATEN' || input.status === 'PARTIAL';
    return prisma.feedingLog.upsert({
      where: {
        mealId_scheduledDate: {
          mealId: input.mealId,
          scheduledDate: input.scheduledDate,
        },
      },
      create: {
        id: `fl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        mealId: input.mealId,
        patientId: petId,
        scheduledDate: input.scheduledDate,
        status: input.status,
        reason: input.reason ?? null,
        notes: input.notes?.trim() || null,
        loggedAt: done ? new Date() : null,
        loggedByUserId: actor.id,
      },
      update: {
        status: input.status,
        reason: input.reason ?? null,
        notes: input.notes?.trim() || null,
        loggedAt: done ? new Date() : null,
        loggedByUserId: actor.id,
      },
      include: { meal: true },
    });
  }
}

/** Materializa reminders diarios de alimentación a partir de FeedingMeal. */
export class SyncFeedingReminders {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'WRITE_FEEDING');
    const feeding = await this.patients.getFeeding(petId);
    const planStatus = (feeding as { status?: string } | null)?.status || 'ACTIVE';
    const meals =
      planStatus === 'ACTIVE'
        ? ((feeding as { meals?: Array<{ id: string; label: string; time: string; amount?: string | null }> } | null)
            ?.meals ?? [])
        : [];
    const mealIds = meals.map((m) => m.id);
    const today = isoToday();

    const existing = await prisma.reminder.findMany({
      where: { petId, feedingMealId: { not: null } },
    });
    const keep = new Set(mealIds);
    for (const rem of existing) {
      if (!rem.feedingMealId || !keep.has(rem.feedingMealId)) {
        await prisma.reminder.delete({ where: { id: rem.id } });
      }
    }

    const synced = [];
    for (const meal of meals) {
      const amountBit = meal.amount ? ` · ${meal.amount}` : '';
      const title = `Comida: ${meal.label}`;
      const description = `Horario ${meal.time}${amountBit}`;
      const found = await prisma.reminder.findFirst({
        where: { petId, feedingMealId: meal.id },
      });
      if (found) {
        synced.push(
          await prisma.reminder.update({
            where: { id: found.id },
            data: {
              title,
              description,
              date: today,
              time: meal.time,
              category: 'alimentacion',
              recurrence: 'daily',
              completed: false,
              notificationMessage: `Hora de alimentar · ${meal.label}${amountBit}`,
            },
          }),
        );
      } else {
        synced.push(
          await prisma.reminder.create({
            data: {
              petId,
              title,
              description,
              date: today,
              time: meal.time,
              type: 'recordatorio',
              category: 'alimentacion',
              recurrence: 'daily',
              createdByUserId: actor.id,
              feedingMealId: meal.id,
              notificationMessage: `Hora de alimentar · ${meal.label}${amountBit}`,
            },
          }),
        );
      }
    }
    return synced;
  }
}

/** Marks PENDING (or missing) meal logs for a past business day as UNLOGGED. */
export class CloseUnloggedFeedingLogs {
  async execute(forDate?: string, now: Date = new Date()) {
    const day =
      forDate && isBusinessDate(forDate)
        ? forDate
        : addCalendarDays(todayInBusinessZone(now), -1);

    const meals = await prisma.feedingMeal.findMany({
      include: { feeding: true },
    });

    let closed = 0;
    for (const meal of meals) {
      const existing = await prisma.feedingLog.findUnique({
        where: {
          mealId_scheduledDate: { mealId: meal.id, scheduledDate: day },
        },
      });
      if (
        closeActionForMeal({
          day,
          mealTime: meal.time,
          planStatus: meal.feeding.status,
          startDate: meal.feeding.startDate,
          archivedAt: meal.archivedAt,
          existingStatus: existing?.status,
          now,
        }) === 'skip'
      ) {
        continue;
      }

      await prisma.feedingLog.upsert({
        where: {
          mealId_scheduledDate: { mealId: meal.id, scheduledDate: day },
        },
        create: {
          id: `fl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          mealId: meal.id,
          patientId: meal.feeding.petId,
          scheduledDate: day,
          status: 'UNLOGGED',
          reason: 'SKIPPED',
          loggedAt: null,
          loggedByUserId: null,
        },
        update: {
          status: 'UNLOGGED',
          reason: existing?.reason || 'SKIPPED',
          loggedAt: null,
        },
      });
      closed += 1;
    }
    return { date: day, closed };
  }
}

/** Compliance summary for vet dashboard + owner progress. */
export class GetFeedingSummary {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(
    actor: AuthActor,
    petId: string,
    options?: { from?: string; to?: string; asOf?: string },
  ) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'READ');
    const feeding = await this.patients.getFeeding(petId);
    if (!feeding) {
      return {
        plan: null,
        compliance: { scheduled: 0, eaten: 0, partial: 0, unlogged: 0, pending: 0, percent: null as number | null },
        week: { days: [] as string[], meals: [] as Array<{ id: string; label: string; time: string; cells: string[] }> },
      };
    }

    const week = weekRange(businessDateOr(options?.from, isoToday()));
    const from = businessDateOr(options?.from, week.from);
    const to = businessDateOr(options?.to, week.to);
    const mealRows = await prisma.feedingMeal.findMany({
      where: { feedingId: feeding.id },
      orderBy: { sortOrder: 'asc' },
    });
    const logs = await prisma.feedingLog.findMany({
      where: {
        patientId: petId,
        scheduledDate: { gte: from, lte: to },
      },
    });
    const summary = summarizeFeeding({
      meals: mealRows.map((meal) => ({
        id: meal.id,
        label: meal.label,
        time: meal.time,
        sortOrder: meal.sortOrder,
        archivedAt: meal.archivedAt,
      })),
      logs: logs.map((log) => ({
        mealId: log.mealId,
        scheduledDate: log.scheduledDate,
        status: log.status,
      })),
      from,
      to,
      weekDays: week.days,
      startDate: feeding.startDate,
      asOf: options?.asOf,
    });

    return {
      plan: feeding,
      compliance: {
        scheduled: summary.scheduled,
        eaten: summary.eaten,
        partial: summary.partial,
        unlogged: summary.unlogged,
        pending: summary.pending,
        percent: summary.percent,
      },
      week: { days: week.days, meals: summary.weekMeals },
    };
  }
}
