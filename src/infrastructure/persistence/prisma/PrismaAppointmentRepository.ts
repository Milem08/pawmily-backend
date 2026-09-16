import { Appointment } from '../../../domain/scheduling/Appointment';
import {
  AppointmentListResult,
  AppointmentRepository,
  CreateAppointmentData,
  UpdateAppointmentData,
} from '../../../domain/scheduling/AppointmentRepository';
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

export class PrismaAppointmentRepository implements AppointmentRepository {
  async create(data: CreateAppointmentData): Promise<Appointment> {
    const row = await prisma.appointment.create({
      data: {
        petName: data.petName,
        ownerName: data.ownerName,
        date: data.date,
        time: data.time,
        notes: data.notes ?? null,
        vetId: data.vetId,
        status: data.status ?? 'Programada',
        attendanceStatus: data.attendanceStatus ?? 'Pendiente',
        patientId: data.patientId ?? null,
      },
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
        orderBy: { time: 'asc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return { items: rows.map(mapAppointment), total };
  }

  async findByPatientIds(
    patientIds: string[],
    options: { page: number; limit: number },
  ): Promise<AppointmentListResult> {
    const where = { patientId: { in: patientIds } };
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
    const row = await prisma.appointment.update({ where: { id }, data });
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
