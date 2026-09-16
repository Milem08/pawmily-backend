import { DomainError } from '../../domain/shared/DomainError';
import { calculateDiet } from '../../domain/patients/DietCalculator';
import { generateSecurePatientCode, Patient } from '../../domain/patients/Patient';
import {
  CreateMedicalRecordData,
  CreateReminderData,
  PatientRepository,
  UpdateMedicalRecordData,
  UpdateReminderData,
  UpsertFeedingData,
} from '../../domain/patients/PatientRepository';
import { buildReminderNotificationMessage } from '../../domain/patients/NotificationMessage';
import { visibleRemindersForActor } from '../../domain/patients/ReminderVisibility';
import { UserRepository } from '../../domain/identity/UserRepository';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import {
  authorizePatientAction,
  AuthActor,
  resolvePatientAccess,
} from '../access/authorizePatientAction';
import { AuditService } from '../../infrastructure/audit/AuditService';

export type { AuthActor };

function assertVet(actor: AuthActor) {
  if (actor.role !== 'vet') {
    throw new DomainError('Solo veterinarios pueden realizar esta acción', 403);
  }
}

function assertOwner(actor: AuthActor) {
  if (actor.role !== 'owner') {
    throw new DomainError('Solo dueños pueden realizar esta acción', 403);
  }
}

async function requireVetPatient(patients: PatientRepository, actor: AuthActor, id: string) {
  assertVet(actor);
  const patient = await patients.findById(id);
  if (!patient || !patient.belongsToVet(actor.id)) {
    throw new DomainError('Paciente no encontrado', 404);
  }
  return patient;
}

export class CreatePatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly audit: AuditService,
    private readonly syncFeedingReminders?: {
      execute: (actor: AuthActor, petId: string) => Promise<unknown>;
    },
  ) {}

  async execute(
    actor: AuthActor,
    data: {
      name: string;
      species: string;
      breed: string;
      age: string;
      sex: string;
      weight?: string;
      color?: string;
      microchip?: string;
      ownerName: string;
      ownerPhone?: string;
      ownerEmail?: string;
      photo?: string;
      feeding?: UpsertFeedingData;
      firstConsultation?: CreateMedicalRecordData & { type?: string };
    },
  ) {
    assertVet(actor);
    let code = generateSecurePatientCode();
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!(await this.patients.codeExists(code))) break;
      code = generateSecurePatientCode();
    }
    if (await this.patients.codeExists(code)) {
      throw new DomainError('No se pudo generar un código único', 500);
    }
    const { feeding: _feeding, firstConsultation: _firstConsultation, ...patientData } = data;
    const patient = await this.patients.create({
      ...patientData,
      code,
      barcodePayload: code,
      vetId: actor.id,
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'CREATE',
      resourceType: 'Patient',
      resourceId: patient.id,
      patientId: patient.id,
    });
    return (await this.patients.findById(patient.id)) as Patient;
  }
}

export class MigrateAllPatientCodes {
  constructor(
    private readonly patients: PatientRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(actor: AuthActor) {
    assertVet(actor);
    const pageSize = 100;
    let page = 1;
    let migrated = 0;
    const mapping: Array<{ id: string; oldCode: string; newCode: string }> = [];

    for (;;) {
      const batch = await this.patients.findByVet(actor.id, { page, limit: pageSize });
      if (!batch.items.length) break;
      for (const patient of batch.items) {
        if (/^PAW-[A-Z2-9]{7}$/.test(patient.code)) continue;
        let newCode = generateSecurePatientCode();
        for (let i = 0; i < 8; i++) {
          if (!(await this.patients.codeExists(newCode))) break;
          newCode = generateSecurePatientCode();
        }
        const oldCode = patient.code;
        await this.patients.migrateCode(patient.id, newCode);
        mapping.push({ id: patient.id, oldCode, newCode });
        migrated += 1;
        await this.audit.log({
          actorId: actor.id,
          action: 'UPDATE',
          resourceType: 'PatientCode',
          resourceId: patient.id,
          patientId: patient.id,
          meta: { oldCode, newCode },
        });
      }
      if (batch.items.length < pageSize) break;
      page += 1;
    }

    return { migrated, mapping };
  }
}

export class ListPatients {
  constructor(private readonly patients: PatientRepository) {}

  async execute(
    actor: AuthActor,
    options: { search?: string; page?: number; limit?: number },
  ) {
    assertVet(actor);
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    return this.patients.findByVet(actor.id, {
      search: options.search,
      page,
      limit,
    });
  }
}

export class ListMyPatients {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, options: { page?: number; limit?: number } = {}) {
    assertOwner(actor);
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    return this.patients.findByOwner(actor.id, { page, limit });
  }
}

export class GetPatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, id: string) {
    const { patient, petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      id,
      'READ',
    );
    return new Patient({
      ...patient.props,
      accessRole: petRole,
      reminders: visibleRemindersForActor(
        patient.props.reminders || [],
        actor.id,
        petRole,
        actor.role,
      ),
    });
  }
}

export class GetPatientByCode {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, code: string) {
    const patient = await this.patients.findByCode(code.toUpperCase());
    if (!patient) {
      throw new DomainError('Paciente no encontrado con ese código', 404);
    }
    const ctx = await resolvePatientAccess(this.patients, this.accesses, actor, patient.id);
    if (!ctx.petRole) {
      throw new DomainError('No autorizado', 403);
    }
    return new Patient({
      ...patient.props,
      accessRole: ctx.petRole,
      reminders: visibleRemindersForActor(
        patient.props.reminders || [],
        actor.id,
        ctx.petRole,
        actor.role,
      ),
    });
  }
}

export class GetPatientBarcode {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, id: string) {
    const { patient } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      id,
      'READ',
    );
    const code = patient.props.barcodePayload || patient.code;
    const imageUrl = `local:code128:${encodeURIComponent(code)}`;
    return { code, format: 'Code128' as const, imageUrl, previousCode: patient.props.previousCode ?? null };
  }
}

/**
 * @deprecated Prefer CreateLinkRequest + ApproveLinkRequest.
 * Kept for brief compatibility: creates a PENDING OWNER request when no owner,
 * or returns conflict instructing to use link-requests for co/caregiver.
 */
export class LinkPatientByCode {
  constructor(
    private readonly patients: PatientRepository,
    private readonly users: UserRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, code: string) {
    assertOwner(actor);
    const patient = await this.patients.findByCode(code.trim().toUpperCase());
    if (!patient) {
      throw new DomainError('Paciente no encontrado con ese código', 404);
    }
    if (patient.belongsToOwner(actor.id) || (await this.accesses.findActive(actor.id, patient.id))) {
      return patient;
    }
    throw new DomainError(
      'La vinculación requiere aprobación. Usa POST /patients/link-requests',
      400,
    );
  }
}

export class UnlinkPatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(actor: AuthActor, id: string) {
    const { patient, petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      id,
      'UNLINK_SELF',
    );

    if (petRole === 'VET') {
      const members = await this.accesses.listActiveForPatient(id);
      for (const m of members) {
        if (m.role === 'OWNER') await this.accesses.revoke(m.userId, id);
      }
      return this.patients.setOwnerUserId(id, null);
    }

    await this.accesses.revoke(actor.id, id);
    await this.audit.log({
      actorId: actor.id,
      action: 'REVOKE',
      resourceType: 'PatientAccess',
      resourceId: actor.id,
      patientId: id,
    });
    if (petRole === 'OWNER') {
      return this.patients.setOwnerUserId(id, null);
    }
    return patient;
  }
}

export class UpdatePatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, id: string, data: Record<string, unknown>) {
    await authorizePatientAction(this.patients, this.accesses, actor, id, 'UPDATE_PROFILE');
    if (actor.role !== 'vet') {
      // Owners may only update limited contact/photo fields
      const allowed = ['photo', 'ownerPhone', 'ownerEmail', 'weight', 'color'];
      const filtered: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in data) filtered[key] = data[key];
      }
      return this.patients.update(id, filtered as never);
    }
    return this.patients.update(id, data as never);
  }
}

export class DeletePatient {
  constructor(
    private readonly patients: PatientRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(actor: AuthActor, id: string) {
    await requireVetPatient(this.patients, actor, id);
    await this.patients.delete(id);
    await this.audit.log({
      actorId: actor.id,
      action: 'DELETE',
      resourceType: 'Patient',
      resourceId: id,
      patientId: id,
    });
  }
}

export class AddMedicalRecord {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly appointments?: import('../../domain/scheduling/AppointmentRepository').AppointmentRepository,
  ) {}

  async execute(actor: AuthActor, petId: string, data: CreateMedicalRecordData) {
    const { patient } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      petId,
      'WRITE_CLINICAL',
    );
    const enriched: CreateMedicalRecordData = {
      ...data,
      type: data.type ?? 'GENERAL',
      vetName: data.vetName || actor.id,
      ownerName: data.ownerName ?? patient.props.ownerName,
      responsibleName: data.responsibleName ?? data.vetName,
      time:
        data.time ??
        new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
    let record = await this.patients.addMedicalRecord(petId, enriched);

    try {
      const { createMedicationDoseReminders } = await import('./MedicationDoseReminders');
      await createMedicationDoseReminders(this.patients, petId, actor.id, patient.props.name, {
        medication: enriched.medication,
        date: enriched.date,
        time: enriched.time,
        typePayload: enriched.typePayload as Record<string, unknown> | undefined,
        consultationNumber: record.consultationNumber,
      });
    } catch {
      // Non-blocking for clinical save
    }

    if (enriched.followUpDate && this.appointments && actor.role === 'vet') {
      const appt = await this.appointments.create({
        petName: patient.props.name,
        ownerName: patient.props.ownerName,
        date: enriched.followUpDate,
        time: enriched.followUpTime || '09:00',
        notes: `Próxima revisión desde ${record.consultationNumber}`,
        vetId: actor.id,
        patientId: petId,
      });
      await this.patients.addReminder(petId, {
        title: `Cita: revisión ${patient.props.name}`,
        description: `Derivada de ${record.consultationNumber}`,
        date: enriched.followUpDate,
        time: enriched.followUpTime || '09:00',
        type: 'cita',
        appointmentId: appt.id,
        createdByUserId: actor.id,
      });
      record = await this.patients.updateMedicalRecord(record.id, {
        followUpAppointmentId: appt.id,
      });
    }
    return record;
  }
}

export class UpdateMedicalRecord {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string, recordId: string, data: UpdateMedicalRecordData) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'WRITE_CLINICAL');
    const record = await this.patients.findMedicalRecordById(recordId);
    if (!record || record.petId !== petId) {
      throw new DomainError('Consulta no encontrada', 404);
    }
    return this.patients.updateMedicalRecord(recordId, data);
  }
}

export class DeleteMedicalRecord {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string, recordId: string) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'WRITE_CLINICAL');
    const record = await this.patients.findMedicalRecordById(recordId);
    if (!record || record.petId !== petId) {
      throw new DomainError('Consulta no encontrada', 404);
    }
    await this.patients.deleteMedicalRecord(recordId);
  }
}

export class ListMedicalRecords {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string) {
    const { petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      petId,
      'READ_CLINICAL',
    );
    const records = await this.patients.listMedicalRecords(petId);
    const {
      toOwnerConsultationView,
      toVetConsultationView,
    } = await import('../../domain/patients/ConsultationTypes');
    if (petRole === 'VET' || actor.role === 'vet') {
      return records.map((r) => toVetConsultationView(r as unknown as Record<string, unknown>));
    }
    return records.map((r) => toOwnerConsultationView(r as unknown as Record<string, unknown>));
  }
}

export class GenerateDiet {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(
    actor: AuthActor,
    petId: string,
    data: {
      weightKg: number;
      mealsPerDay?: number;
      activityFactor?: number;
      vetNotes?: string;
      species?: string;
      objective?: string;
      targetWeightKg?: number;
      startDate?: string;
      reviewDate?: string;
    },
  ) {
    const { patient } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      petId,
      'WRITE_FEEDING',
    );
    const diet = calculateDiet({
      weightKg: data.weightKg,
      mealsPerDay: data.mealsPerDay,
      activityFactor: data.activityFactor,
      vetNotes: data.vetNotes,
      species: data.species ?? patient.props.species,
    });

    const existing = await this.patients.getFeeding(petId);
    const today = new Date().toISOString().slice(0, 10);

    return this.patients.upsertFeeding(petId, {
      recommendedAmount: diet.recommendedAmount,
      mealsPerDay: diet.mealsPerDay,
      specialInstructions: diet.specialInstructions ?? existing?.specialInstructions ?? null,
      weightKg: diet.weightKg,
      caloriesPerDay: diet.caloriesPerDay,
      formulaVersion: diet.formulaVersion,
      vetNotes: diet.vetNotes ?? null,
      foodType: existing?.foodType ?? null,
      brand: existing?.brand ?? null,
      quantity: existing?.quantity ?? null,
      frequency: existing?.frequency ?? null,
      restrictions: existing?.restrictions ?? null,
      allergies: existing?.allergies ?? null,
      observations: existing?.observations ?? null,
      vetRecommendations: existing?.vetRecommendations ?? null,
      allowedFoods: existing?.allowedFoods ?? null,
      forbiddenFoods: existing?.forbiddenFoods ?? null,
      objective: data.objective ?? existing?.objective ?? null,
      targetWeightKg: data.targetWeightKg ?? existing?.targetWeightKg ?? null,
      startDate: data.startDate ?? existing?.startDate ?? today,
      reviewDate: data.reviewDate ?? existing?.reviewDate ?? null,
      status: 'ACTIVE',
    });
  }
}

export class UpdateFeeding {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly syncFeedingReminders?: {
      execute: (actor: AuthActor, petId: string) => Promise<unknown>;
    },
  ) {}

  async execute(actor: AuthActor, petId: string, data: UpsertFeedingData) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'WRITE_FEEDING');
    const existing = await this.patients.getFeeding(petId);
    const today = new Date().toISOString().slice(0, 10);
    const feeding = await this.patients.upsertFeeding(petId, {
      ...data,
      startDate: data.startDate ?? existing?.startDate ?? today,
      status: data.status ?? existing?.status ?? 'ACTIVE',
    });
    if (this.syncFeedingReminders && (data.meals !== undefined || data.status !== undefined)) {
      await this.syncFeedingReminders.execute(actor, petId);
    }
    return feeding;
  }
}

export class GetFeeding {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string) {
    await authorizePatientAction(this.patients, this.accesses, actor, petId, 'READ');
    return this.patients.getFeeding(petId);
  }
}

function canManagePersonalReminder(
  petRole: string | null,
  actor: AuthActor,
  createdByUserId?: string | null,
): boolean {
  if (petRole === 'VET') return false;
  if (petRole === 'OWNER' || petRole === 'CO_OWNER') {
    return !createdByUserId || createdByUserId === actor.id || petRole === 'OWNER';
  }
  return false;
}

export class AddReminder {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string, data: CreateReminderData) {
    const type = data.type ?? 'recordatorio';
    if (actor.role === 'vet' && type !== 'cita') {
      throw new DomainError('El veterinario solo gestiona citas, no recordatorios personales', 403);
    }
    const action = type === 'cita' ? 'WRITE_MEDICAL_REMINDER' : 'WRITE_PERSONAL_REMINDER';
    const { patient, petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      petId,
      action,
    );

    // CAREGIVER: read + notify only (cannot create)
    if (petRole === 'CAREGIVER') {
      throw new DomainError('Los cuidadores no pueden crear recordatorios', 403);
    }

    const notificationMessage = buildReminderNotificationMessage({
      type,
      title: data.title,
      category: data.category,
      petName: patient.props.name,
      date: data.date,
      time: data.time,
    });

    return this.patients.addReminder(petId, {
      ...data,
      type,
      createdByUserId: actor.id,
      notificationMessage,
    });
  }
}

export class UpdateReminder {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, reminderId: string, data: UpdateReminderData) {
    const reminder = await this.patients.findReminderById(reminderId);
    if (!reminder) {
      throw new DomainError('Recordatorio no encontrado', 404);
    }
    if (reminder.type === 'cita') {
      throw new DomainError('Las citas médicas no se pueden editar desde recordatorios', 403);
    }
    const { patient, petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      reminder.petId,
      'WRITE_PERSONAL_REMINDER',
    );
    if (!canManagePersonalReminder(petRole, actor, reminder.createdByUserId)) {
      throw new DomainError('No autorizado', 403);
    }

    const nextPriority =
      data.priority !== undefined ? data.priority : reminder.priority;
    const becomingAlta =
      typeof nextPriority === 'string' &&
      nextPriority.toLowerCase() === 'alta' &&
      (reminder.priority ?? '').toLowerCase() !== 'alta';
    if (becomingAlta) {
      const siblings = await this.patients.listReminders(reminder.petId);
      const altaCount = siblings.filter(
        (r) =>
          r.id !== reminderId && (r.priority ?? '').toLowerCase() === 'alta',
      ).length;
      if (altaCount >= 3) {
        throw new DomainError(
          'Ya hay 3 recordatorios prioritarios para esta mascota',
          409,
        );
      }
    }

    const nextTitle = data.title ?? reminder.title;
    const nextDate = data.date ?? reminder.date;
    const nextTime = data.time !== undefined ? data.time : reminder.time;
    const nextCategory = data.category !== undefined ? data.category : reminder.category;
    const notificationMessage = buildReminderNotificationMessage({
      type: reminder.type,
      title: nextTitle,
      category: nextCategory,
      petName: patient.props.name,
      date: nextDate,
      time: nextTime,
    });

    return this.patients.updateReminder(reminderId, {
      ...data,
      notificationMessage,
    });
  }
}

export class CompleteReminder {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, reminderId: string) {
    const reminder = await this.patients.findReminderById(reminderId);
    if (!reminder) {
      throw new DomainError('Recordatorio no encontrado', 404);
    }
    if (reminder.type === 'cita') {
      throw new DomainError('Las citas médicas no se marcan como completadas aquí', 403);
    }
    // Caregivers: read + notify (may complete); OWNER/CO_OWNER/VET manage personal.
    const { petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      reminder.petId,
      'READ',
    );
    if (
      petRole !== 'CAREGIVER' &&
      !canManagePersonalReminder(petRole, actor, reminder.createdByUserId)
    ) {
      throw new DomainError('No autorizado', 403);
    }
    return this.patients.updateReminder(reminderId, {
      completed: true,
      completedAt: new Date(),
    });
  }
}

export class ListReminders {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, petId: string) {
    const { petRole } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      petId,
      'READ',
    );
    const reminders = await this.patients.listReminders(petId);
    return visibleRemindersForActor(reminders, actor.id, petRole, actor.role);
  }
}

export class DeleteReminder {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, reminderId: string) {
    const reminder = await this.patients.findReminderById(reminderId);
    if (!reminder) {
      throw new DomainError('Recordatorio no encontrado', 404);
    }
    if (reminder.type === 'cita') {
      await authorizePatientAction(
        this.patients,
        this.accesses,
        actor,
        reminder.petId,
        'WRITE_MEDICAL_REMINDER',
      );
    } else {
      const { petRole } = await authorizePatientAction(
        this.patients,
        this.accesses,
        actor,
        reminder.petId,
        'WRITE_PERSONAL_REMINDER',
      );
      if (!canManagePersonalReminder(petRole, actor, reminder.createdByUserId)) {
        throw new DomainError('No autorizado', 403);
      }
    }
    await this.patients.deleteReminder(reminderId);
  }
}
