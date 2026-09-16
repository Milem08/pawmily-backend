import { DomainError } from '../../domain/shared/DomainError';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import { authorizePatientAction, AuthActor } from '../access/authorizePatientAction';
import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';

type LogStatus = 'EATEN' | 'PENDING' | 'UNLOGGED' | 'PARTIAL';
type LogReason = 'NORMAL' | 'LESS' | 'REFUSED' | 'SKIPPED' | 'OTHER';

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function weekRange(anchor?: string): { from: string; to: string; days: string[] } {
  const base = anchor || isoToday();
  const d = new Date(base + 'T12:00:00');
  const day = d.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDaysIso(base, mondayOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
  return { from: days[0], to: days[6], days };
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
    const meal = await prisma.feedingMeal.findUnique({
      where: { id: input.mealId },
      include: { feeding: true },
    });
    if (!meal || meal.feeding.petId !== petId) {
      throw new DomainError('Comida no encontrada', 404);
    }
    const planStatus = (meal.feeding as { status?: string }).status || 'ACTIVE';
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

/** Marks PENDING (or missing) meal logs for a calendar day as UNLOGGED. */
export class CloseUnloggedFeedingLogs {
  async execute(forDate?: string) {
    const day =
      forDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().slice(0, 10);
      })();

    const meals = await prisma.feedingMeal.findMany({
      include: { feeding: true },
    });

    let closed = 0;
    for (const meal of meals) {
      const planStatus = (meal.feeding as { status?: string }).status || 'ACTIVE';
      if (planStatus !== 'ACTIVE') continue;

      const petId = meal.feeding.petId;
      const existing = await prisma.feedingLog.findUnique({
        where: {
          mealId_scheduledDate: { mealId: meal.id, scheduledDate: day },
        },
      });
      if (
        existing?.status === 'EATEN' ||
        existing?.status === 'UNLOGGED' ||
        existing?.status === 'PARTIAL'
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
          patientId: petId,
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

  async execute(actor: AuthActor, petId: string, options?: { from?: string; to?: string }) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'READ');
    const feeding = await this.patients.getFeeding(petId);
    if (!feeding) {
      return {
        plan: null,
        compliance: { scheduled: 0, eaten: 0, partial: 0, unlogged: 0, pending: 0, percent: 0 },
        week: { days: [] as string[], meals: [] as Array<{ id: string; label: string; cells: string[] }> },
      };
    }

    const week = weekRange(options?.from || isoToday());
    const from = options?.from || week.from;
    const to = options?.to || week.to;

    const meals = (feeding.meals || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    const logs = await prisma.feedingLog.findMany({
      where: {
        patientId: petId,
        scheduledDate: { gte: from, lte: to },
      },
    });

    const byKey = new Map(logs.map((l) => [`${l.mealId}|${l.scheduledDate}`, l]));
    const today = isoToday();

    let eaten = 0;
    let partial = 0;
    let unlogged = 0;
    let pending = 0;
    let scheduled = 0;

    for (const day of enumerateDays(from, to)) {
      for (const meal of meals) {
        scheduled += 1;
        const log = byKey.get(`${meal.id}|${day}`);
        const status = log?.status || (day < today ? 'UNLOGGED' : 'PENDING');
        if (status === 'EATEN') eaten += 1;
        else if (status === 'PARTIAL') partial += 1;
        else if (status === 'UNLOGGED') unlogged += 1;
        else pending += 1;
      }
    }

    const done = eaten + partial;
    const percent = scheduled > 0 ? Math.round((done / scheduled) * 100) : 0;

    const weekMeals = meals.map((meal) => ({
      id: meal.id,
      label: meal.label,
      time: meal.time,
      cells: week.days.map((day) => {
        const log = byKey.get(`${meal.id}|${day}`);
        if (log?.status) return log.status;
        return day < today ? 'UNLOGGED' : day === today ? 'PENDING' : 'PENDING';
      }),
    }));

    return {
      plan: feeding,
      compliance: { scheduled, eaten, partial, unlogged, pending, percent },
      week: { days: week.days, meals: weekMeals },
    };
  }
}

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    if (out.length > 62) break;
  }
  return out;
}
