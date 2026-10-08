import { Prisma } from '@prisma/client';
import { Appointment } from '../../../domain/scheduling/Appointment';
import { occupiesAppointmentSlot } from '../../../domain/scheduling/appointmentNotes';
import {
  AppointmentListResult,
  AppointmentRepository,
  CreateAppointmentData,
  UpdateAppointmentData,
} from '../../../domain/scheduling/AppointmentRepository';
import { DomainError } from '../../../domain/shared/DomainError';
import { prisma } from './prismaClient';

function mapAppointment(row: any): Appointment {
  return new Appointment(row);
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

const ACTIVE_SLOT: Prisma.AppointmentWhereInput = {
  NOT: {
    OR: [
      { status: { equals: 'cancelada', mode: 'insensitive' } },
      { status: { equals: 'eliminada', mode: 'insensitive' } },
    ],
  },
};

async function lockSlot(tx: Prisma.TransactionClient, vetId: string, date: string, time: string) {
  const lockKey = `appt:${vetId}:${date}:${time}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 74822)`;
}

export class PrismaAppointmentRepository implements AppointmentRepository {
  async create(data: CreateAppointmentData): Promise<Appointment> {
    const row = await prisma.$transaction(async (tx) => {
      const status = data.status ?? 'Programada';
      if (occupiesAppointmentSlot(status)) {
        await lockSlot(tx, data.vetId, data.date, data.time);
        const clash = await tx.appointment.findFirst({
          where: {
            vetId: data.vetId,
            date: data.date,
            time: data.time,
            ...ACTIVE_SLOT,
          },
        });
        if (clash) {
          throw new DomainError('Ese horario ya está ocupado', 409);
        }
      }
      return tx.appointment.create({
        data: {
          petName: data.petName,
          ownerName: data.ownerName,
          date: data.date,
          time: data.time,
          notes: data.notes ?? null,
          vetId: data.vetId,
          status,
          attendanceStatus: data.attendanceStatus ?? 'Pendiente',
          patientId: data.patientId ?? null,
        },
      });
    });
    return mapAppointment(row);
  }

  async findById(id: string): Promise<Appointment | null> {
    const row = await prisma.appointment.findUnique({ where: { id } });
    return row ? mapAppointment(row) : null;
  }

  async findByVet(
    vetId: string,
    options: { date?: string; page: number; limit: number },
  ): Promise<AppointmentListResult> {
    const where: any = { vetId };
    if (options.date) {
      where.date = options.date;
    }

    const [total, rows] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return { items: rows.map(mapAppointment), total };
  }

  async findByPatientIds(
    patientIds: string[],
    options: { page: number; limit: number; excludeStatuses?: string[] },
  ): Promise<AppointmentListResult> {
    const where: Prisma.AppointmentWhereInput = { patientId: { in: patientIds } };
    if (options.excludeStatuses?.length) {
      where.NOT = {
        OR: options.excludeStatuses.map((status) => ({
          status: { equals: status, mode: 'insensitive' as const },
        })),
      };
    }
    const [total, rows] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);
    return { items: rows.map(mapAppointment), total };
  }

  async findByMonth(vetId: string, year: number, month: number): Promise<Appointment[]> {
    const { start, end } = monthRange(year, month);
    const rows = await prisma.appointment.findMany({
      where: {
        vetId,
        date: { gte: start, lt: end },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
    return rows.map(mapAppointment);
  }

  async update(id: string, data: UpdateAppointmentData): Promise<Appointment> {
    const touchesSlot =
      data.date !== undefined || data.time !== undefined || data.status !== undefined;
    if (!touchesSlot) {
      const row = await prisma.appointment.update({ where: { id }, data });
      return mapAppointment(row);
    }

    const row = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id } });
      if (!current) {
        throw new DomainError('Cita no encontrada', 404);
      }
      const nextDate = data.date ?? current.date;
      const nextTime = data.time ?? current.time;
      const nextStatus = data.status ?? current.status;
      const moving =
        occupiesAppointmentSlot(nextStatus) &&
        (nextDate !== current.date ||
          nextTime !== current.time ||
          !occupiesAppointmentSlot(current.status));
      if (moving) {
        await lockSlot(tx, current.vetId, nextDate, nextTime);
        const clash = await tx.appointment.findFirst({
          where: {
            id: { not: id },
            vetId: current.vetId,
            date: nextDate,
            time: nextTime,
            ...ACTIVE_SLOT,
          },
        });
        if (clash) {
          throw new DomainError('Ese horario ya está ocupado', 409);
        }
      }
      return tx.appointment.update({ where: { id }, data });
    });
    return mapAppointment(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.reminder.updateMany({
      where: { appointmentId: id },
      data: { appointmentId: null },
    });
    await prisma.appointment.delete({ where: { id } });
  }
}
