import { Patient } from '../../../domain/patients/Patient';
import {
  CreateMedicalRecordData,
  CreatePatientData,
  CreateReminderData,
  PatientListResult,
  PatientRepository,
  UpdateMedicalRecordData,
  UpdatePatientData,
  UpdateReminderData,
  UpsertFeedingData,
} from '../../../domain/patients/PatientRepository';
import { prisma } from './prismaClient';

function mapPatient(row: any): Patient {
  return new Patient(row);
}

export class PrismaPatientRepository implements PatientRepository {
  async count(): Promise<number> {
    return prisma.patient.count();
  }

  async maxCodeSequence(): Promise<number> {
    // Legacy helper; new codes are random. Kept for tests/compat.
    const rows = await prisma.patient.findMany({
      select: { code: true },
      orderBy: { code: 'desc' },
      take: 50,
    });
    let max = 0;
    for (const row of rows) {
      const m = /^PAW-(\d+)$/i.exec(row.code || '');
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > max) max = n;
      }
    }
    return max;
  }

  async codeExists(code: string): Promise<boolean> {
    const row = await prisma.patient.findFirst({
      where: { OR: [{ code }, { previousCode: code }] },
      select: { id: true },
    });
    return Boolean(row);
  }

  async migrateCode(id: string, newCode: string): Promise<Patient> {
    const current = await prisma.patient.findUnique({ where: { id } });
    if (!current) throw new Error('Patient not found');
    const row = await prisma.patient.update({
      where: { id },
      data: {
        previousCode: current.code,
        code: newCode,
        barcodePayload: newCode,
      },
    });
    return mapPatient(row);
  }

  async create(data: CreatePatientData & { code: string; barcodePayload: string }): Promise<Patient> {
    const row = await prisma.patient.create({
      data: {
        code: data.code,
        barcodePayload: data.barcodePayload,
        name: data.name,
        species: data.species,
        breed: data.breed,
        age: data.age,
        sex: data.sex,
        weight: data.weight ?? null,
        color: data.color ?? null,
        microchip: data.microchip ?? 'No',
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone ?? null,
        ownerEmail: data.ownerEmail ?? null,
        photo: data.photo ?? null,
        vetId: data.vetId,
        ownerUserId: data.ownerUserId ?? null,
      },
      include: { medicalRecords: true, feeding: true, reminders: true },
    });
    return mapPatient(row);
  }

  async findById(id: string): Promise<Patient | null> {
    const row = await prisma.patient.findUnique({
      where: { id },
      include: {
        medicalRecords: { orderBy: { createdAt: 'desc' } },
        feeding: true,
        reminders: { orderBy: { createdAt: 'desc' } },
      },
    });
    return row ? mapPatient(row) : null;
  }

  async findByCode(code: string): Promise<Patient | null> {
    const normalized = code.toUpperCase();
    const row = await prisma.patient.findFirst({
      where: {
        OR: [{ code: normalized }, { previousCode: normalized }],
      },
      include: {
        medicalRecords: { orderBy: { createdAt: 'desc' } },
        feeding: true,
        reminders: { orderBy: { createdAt: 'desc' } },
      },
    });
    return row ? mapPatient(row) : null;
  }

  async findByVet(
    vetId: string,
    options: { search?: string; page: number; limit: number },
  ): Promise<PatientListResult> {
    const where: any = { vetId };
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { ownerName: { contains: options.search, mode: 'insensitive' } },
        { species: { contains: options.search, mode: 'insensitive' } },
        { breed: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
        { previousCode: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    // Lean list payloads: no nested clinical/reminder graphs by default.
    const [total, rows] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
    ]);

    return { items: rows.map(mapPatient), total };
  }

  async findByOwner(
    ownerUserId: string,
    options: { page: number; limit: number },
  ): Promise<PatientListResult> {
    // Dual-read: legacy ownerUserId OR active PatientAccess.
    const where = {
      OR: [
        { ownerUserId },
        {
          accesses: {
            some: { userId: ownerUserId, status: 'ACTIVE', revokedAt: null },
          },
        },
      ],
    };
    const [total, rows] = await Promise.all([
      prisma.patient.count({ where }),
      prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          accesses: {
            where: { userId: ownerUserId, status: 'ACTIVE', revokedAt: null },
            take: 1,
          },
        },
      }),
    ]);
    return {
      items: rows.map((row: any) => {
        const accessRole = row.accesses?.[0]?.role ?? (row.ownerUserId === ownerUserId ? 'OWNER' : null);
        const { accesses: _a, ...rest } = row;
        return mapPatient({ ...rest, accessRole });
      }),
      total,
    };
  }

  async findManyByIds(ids: string[]): Promise<Patient[]> {
    if (!ids.length) return [];
    const rows = await prisma.patient.findMany({
      where: { id: { in: ids } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapPatient);
  }

  async update(id: string, data: UpdatePatientData): Promise<Patient> {
    const row = await prisma.patient.update({
      where: { id },
      data,
      include: { medicalRecords: true, feeding: true, reminders: true },
    });
    return mapPatient(row);
  }

  async setOwnerUserId(id: string, ownerUserId: string | null): Promise<Patient> {
    const row = await prisma.patient.update({
      where: { id },
      data: { ownerUserId },
      include: { medicalRecords: true, feeding: true, reminders: true },
    });
    return mapPatient(row);
  }

  async claimPrimaryOwner(
    id: string,
    data: {
      ownerUserId: string;
      ownerName: string;
      ownerPhone?: string | null;
      ownerEmail?: string | null;
    },
  ): Promise<Patient> {
    const row = await prisma.patient.update({
      where: { id },
      data: {
        ownerUserId: data.ownerUserId,
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone ?? null,
        ownerEmail: data.ownerEmail ?? null,
      },
      include: { medicalRecords: true, feeding: true, reminders: true },
    });
    return mapPatient(row);
  }

  async delete(id: string): Promise<void> {
    await prisma.linkRequest.deleteMany({ where: { patientId: id } });
    await prisma.patientAccess.deleteMany({ where: { patientId: id } });
    await prisma.mediaAsset.deleteMany({ where: { patientId: id } });
    await prisma.auditLog.updateMany({ where: { patientId: id }, data: { patientId: null } });
    await prisma.reminder.deleteMany({ where: { petId: id } });
    await prisma.medicalRecord.deleteMany({ where: { petId: id } });
    await prisma.feeding.deleteMany({ where: { petId: id } });
    await prisma.appointment.updateMany({ where: { patientId: id }, data: { patientId: null } });
    await prisma.patient.delete({ where: { id } });
  }

  async addMedicalRecord(petId: string, data: CreateMedicalRecordData) {
    const { allocateConsultationNumber } = await import('./allocateConsultationNumber');
    const consultationNumber = await allocateConsultationNumber();
    return prisma.medicalRecord.create({
      data: {
        petId,
        consultationNumber,
        type: data.type ?? 'GENERAL',
        date: data.date,
        time: data.time ?? null,
        reason: data.reason,
        diagnosis: data.diagnosis ?? null,
        treatment: data.treatment ?? null,
        vetName: data.vetName,
        ownerName: data.ownerName ?? null,
        responsibleName: data.responsibleName ?? null,
        status: data.status ?? 'En Proceso',
        weightAtVisit: data.weightAtVisit ?? null,
        temperature: data.temperature ?? null,
        heartRate: data.heartRate ?? null,
        respiratoryRate: data.respiratoryRate ?? null,
        physicalExam: data.physicalExam ?? null,
        prescriptions: data.prescriptions ?? null,
        medication: data.medication ?? null,
        results: data.results ?? null,
        observations: data.observations ?? null,
        notes: data.notes ?? null,
        privateNotes: data.privateNotes ?? null,
        typePayload: (data.typePayload as object | undefined) ?? undefined,
        followUpDate: data.followUpDate ?? null,
        followUpTime: data.followUpTime ?? null,
        relatedConsultationId: data.relatedConsultationId ?? null,
        followUpAppointmentId: data.followUpAppointmentId ?? null,
      },
    });
  }

  async updateMedicalRecord(recordId: string, data: UpdateMedicalRecordData) {
    return prisma.medicalRecord.update({
      where: { id: recordId },
      data: data as never,
    });
  }

  async deleteMedicalRecord(recordId: string): Promise<void> {
    await prisma.medicalRecord.delete({ where: { id: recordId } });
  }

  async findMedicalRecordById(recordId: string) {
    return prisma.medicalRecord.findUnique({ where: { id: recordId } });
  }

  async listMedicalRecords(petId: string) {
    return prisma.medicalRecord.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsertFeeding(petId: string, data: UpsertFeedingData) {
    const { meals, ...rest } = data;
    const feedingData = {
      ...rest,
      status: rest.status ?? 'ACTIVE',
      objective: rest.objective ?? undefined,
      targetWeightKg: rest.targetWeightKg ?? undefined,
      startDate: rest.startDate ?? undefined,
      reviewDate: rest.reviewDate ?? undefined,
    };
    const feeding = await prisma.feeding.upsert({
      where: { petId },
      update: feedingData,
      create: { petId, ...feedingData },
    });
    if (meals) {
      const existingMeals = await prisma.feedingMeal.findMany({
        where: { feedingId: feeding.id },
        orderBy: { sortOrder: 'asc' },
      });
      const keepIds = new Set<string>();
      for (let i = 0; i < meals.length; i += 1) {
        const m = meals[i];
        const prev = existingMeals[i];
        if (prev) {
          await prisma.feedingMeal.update({
            where: { id: prev.id },
            data: {
              label: m.label,
              time: m.time,
              amount: m.amount ?? null,
              food: m.food ?? null,
              notes: m.notes ?? null,
              sortOrder: m.sortOrder ?? i,
            },
          });
          keepIds.add(prev.id);
        } else {
          const created = await prisma.feedingMeal.create({
            data: {
              id: `fm_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
              feedingId: feeding.id,
              label: m.label,
              time: m.time,
              amount: m.amount ?? null,
              food: m.food ?? null,
              notes: m.notes ?? null,
              sortOrder: m.sortOrder ?? i,
            },
          });
          keepIds.add(created.id);
        }
      }
      const toDelete = existingMeals.filter((m) => !keepIds.has(m.id)).map((m) => m.id);
      if (toDelete.length) {
        await prisma.feedingMeal.deleteMany({ where: { id: { in: toDelete } } });
      }
    }
    return this.getFeeding(petId) as Promise<NonNullable<Awaited<ReturnType<typeof this.getFeeding>>>>;
  }

  async getFeeding(petId: string) {
    return prisma.feeding.findUnique({
      where: { petId },
      include: { meals: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async addReminder(petId: string, data: CreateReminderData) {
    return prisma.reminder.create({
      data: {
        petId,
        title: data.title,
        description: data.description ?? null,
        date: data.date,
        time: data.time ?? null,
        type: data.type ?? 'recordatorio',
        category: data.category ?? null,
        priority: data.priority ?? 'media',
        color: data.color ?? null,
        icon: data.icon ?? null,
        notifyEnabled: data.notifyEnabled ?? true,
        notes: data.notes ?? null,
        recurrence: data.recurrence ?? 'none',
        createdByUserId: data.createdByUserId ?? null,
        notificationMessage: data.notificationMessage ?? null,
        appointmentId: data.appointmentId ?? null,
        feedingMealId: data.feedingMealId ?? null,
      },
    });
  }

  async updateReminder(id: string, data: UpdateReminderData) {
    return prisma.reminder.update({
      where: { id },
      data,
    });
  }

  async listReminders(petId: string) {
    return prisma.reminder.findMany({
      where: { petId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteReminder(id: string): Promise<void> {
    await prisma.reminder.delete({ where: { id } });
  }

  async findReminderById(id: string) {
    return prisma.reminder.findUnique({ where: { id } });
  }
}
