import { DomainError } from '../../domain/shared/DomainError';
import { AppointmentRepository } from '../../domain/scheduling/AppointmentRepository';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { buildReminderNotificationMessage } from '../../domain/patients/NotificationMessage';
import { Role } from '../../domain/identity/Role';
import { createClinicMessage } from '../inbox/ClinicInbox';
import { Appointment } from '../../domain/scheduling/Appointment';

export interface AuthActor {
  id: string;
  role: Role;
}

function assertVet(actor: AuthActor) {
  if (actor.role !== 'vet') {
    throw new DomainError('Solo veterinarios pueden gestionar citas', 403);
  }
}

async function assertOwnerOfPatient(
  patients: PatientRepository,
  actor: AuthActor,
  patientId: string,
) {
  if (actor.role !== 'owner') {
    throw new DomainError('Solo dueños pueden realizar esta acción', 403);
  }
  const accessible = await patients.findByOwner(actor.id, { page: 1, limit: 500 });
  if (!accessible.items.some((p) => p.id === patientId)) {
    throw new DomainError('No autorizado', 403);
  }
}

function reasonFromNotes(notes: string | null | undefined): string {
  const raw = (notes || '').trim();
  if (!raw) return '';
  // Strip internal tags for display
  return raw
    .replace(/\[Aplazamiento\][^\n]*/gi, '')
    .replace(/\[Propuesta (vet|owner)\][^\n]*/gi, '')
    .replace(/\[Eliminada[^\]]*\]/gi, '')
    .trim();
}

function appointmentPayload(
  appointment: Appointment,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    petName: appointment.props.petName,
    ownerName: appointment.props.ownerName,
    date: appointment.props.date,
    time: appointment.props.time,
    reason: reasonFromNotes(appointment.props.notes),
    action: 'review_appointment',
    ...extras,
  };
}

async function notifySafe(data: {
  userId: string;
  patientId?: string | null;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}) {
  try {
    await createClinicMessage({
      userId: data.userId,
      patientId: data.patientId ?? null,
      type: data.type,
      title: data.title,
      body: data.body,
      payload: data.payload ?? null,
    });
  } catch {
    // Non-blocking for clinical flows
  }
}

async function ensureCitaReminder(
  patients: PatientRepository,
  actorId: string,
  appointment: Appointment,
) {
  const patientId = appointment.patientId;
  if (!patientId) return;
  const petName = appointment.props.petName;
  const date = appointment.props.date;
  const time = appointment.props.time;
  const notificationMessage = buildReminderNotificationMessage({
    type: 'cita',
    title: `Cita: ${petName}`,
    category: 'cita',
    petName,
    date,
    time,
  });
  await patients.addReminder(patientId, {
    title: `Cita: ${petName}`,
    date,
    time,
    type: 'cita',
    category: 'cita',
    appointmentId: appointment.id,
    createdByUserId: actorId,
    notificationMessage,
  });
}

/** Resolve owner user ids for a patient (ownerUserId + active accessors). */
async function ownerRecipientIds(
  patients: PatientRepository,
  patientId: string,
): Promise<string[]> {
  const patient = await patients.findById(patientId);
  const ids = new Set<string>();
  if (patient?.props.ownerUserId) ids.add(patient.props.ownerUserId);
  try {
    const { prisma } = await import('../../infrastructure/persistence/prisma/prismaClient');
    const grants = await prisma.patientAccess.findMany({
      where: { patientId, status: 'ACTIVE', revokedAt: null },
      select: { userId: true },
    });
    for (const g of grants) ids.add(g.userId);
  } catch {
    /* ignore */
  }
  return [...ids];
}

export class CreateAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    actor: AuthActor,
    data: {
      petName: string;
      ownerName: string;
      date: string;
      time: string;
      notes?: string;
      patientId?: string;
    },
  ) {
    assertVet(actor);

    let petName = data.petName;
    let ownerName = data.ownerName;
    let patientId = data.patientId ?? null;

    if (patientId) {
      const patient = await this.patients.findById(patientId);
      if (!patient || !patient.belongsToVet(actor.id)) {
        throw new DomainError('Paciente no encontrado', 404);
      }
      petName = patient.props.name;
      ownerName = patient.props.ownerName;
    }

    const appointment = await this.appointments.create({
      petName,
      ownerName,
      date: data.date,
      time: data.time,
      notes: data.notes,
      vetId: actor.id,
      patientId,
    });

    if (patientId) {
      await ensureCitaReminder(this.patients, actor.id, appointment);
    }

    return appointment;
  }
}

export class ListMyAppointments {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(actor: AuthActor, options: { page?: number; limit?: number } = {}) {
    if (actor.role !== 'owner') {
      throw new DomainError('Solo dueños pueden listar sus citas', 403);
    }
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    const mine = await this.patients.findByOwner(actor.id, { page: 1, limit: 100 });
    const ids = mine.items.map((p) => p.id);
    if (!ids.length) {
      return { items: [], total: 0 };
    }
    const result = await this.appointments.findByPatientIds(ids, { page, limit });
    const active = result.items.filter((a) => {
      const s = (a.props.status || '').toLowerCase();
      return s !== 'eliminada' && s !== 'cancelada';
    });
    return { items: active, total: active.length };
  }
}

export class ConfirmAppointmentAttendance {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(actor: AuthActor, appointmentId: string) {
    if (actor.role !== 'owner') {
      throw new DomainError('Solo el dueño puede confirmar asistencia', 403);
    }
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment || !appointment.patientId) {
      throw new DomainError('Cita no encontrada', 404);
    }
    await assertOwnerOfPatient(this.patients, actor, appointment.patientId);
    const status = (appointment.props.status || '').toLowerCase();
    if (status === 'solicitada' || status === 'eliminada' || status === 'cancelada') {
      throw new DomainError('Esta cita aún no está programada por la clínica', 400);
    }
    return this.appointments.update(appointmentId, {
      attendanceStatus: 'Confirmada',
      ownerConfirmedAt: new Date(),
      status: 'Confirmada',
    });
  }
}

/** Owner requests an appointment slot; remains Solicitada until the vet accepts. */
export class RequestAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    actor: AuthActor,
    data: {
      patientId: string;
      date: string;
      time: string;
      notes?: string;
    },
  ) {
    if (actor.role !== 'owner') {
      throw new DomainError('Solo dueños pueden solicitar citas', 403);
    }
    const patient = await this.patients.findById(data.patientId);
    if (!patient) {
      throw new DomainError('Paciente no encontrado', 404);
    }
    await assertOwnerOfPatient(this.patients, actor, patient.id);
    const vetId = patient.props.vetId;
    if (!vetId) {
      throw new DomainError('La mascota no tiene veterinario asignado', 400);
    }

    const reason = data.notes?.trim() || 'Solicitud del dueño';
    const appointment = await this.appointments.create({
      petName: patient.props.name,
      ownerName: patient.props.ownerName,
      date: data.date,
      time: data.time,
      notes: reason,
      vetId,
      patientId: patient.id,
      status: 'Solicitada',
      attendanceStatus: 'Pendiente',
    });

    await notifySafe({
      userId: vetId,
      patientId: patient.id,
      type: 'appointment_request',
      title: `Solicitud de cita: ${patient.props.name}`,
      body: [
        `Paciente: ${patient.props.name}`,
        `Dueño: ${patient.props.ownerName}`,
        `Fecha sugerida: ${data.date}`,
        `Hora: ${data.time}`,
        `Motivo: ${reason}`,
      ].join('\n'),
      payload: appointmentPayload(appointment, {
        proposedBy: 'owner',
        reason,
      }),
    });

    return appointment;
  }
}

/**
 * Accept a Solicitada request (vet or owner responding to the other party's proposal).
 * Marks Programada + Pendiente and notifies the other party.
 */
export class AcceptAppointmentRequest {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    actor: AuthActor,
    appointmentId: string,
    data: { date?: string; time?: string; notes?: string } = {},
  ) {
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment) {
      throw new DomainError('Cita no encontrada', 404);
    }

    if (actor.role === 'vet') {
      if (!appointment.belongsToVet(actor.id)) {
        throw new DomainError('Cita no encontrada', 404);
      }
    } else if (actor.role === 'owner') {
      if (!appointment.patientId) {
        throw new DomainError('Cita no encontrada', 404);
      }
      await assertOwnerOfPatient(this.patients, actor, appointment.patientId);
    } else {
      throw new DomainError('No autorizado', 403);
    }

    const status = (appointment.props.status || '').toLowerCase();
    if (status === 'eliminada' || status === 'cancelada' || status === 'completada') {
      throw new DomainError('Esta solicitud ya no se puede aceptar', 400);
    }

    const date = data.date ?? appointment.props.date;
    const time = data.time ?? appointment.props.time;
    const notes = data.notes !== undefined ? data.notes : appointment.props.notes;

    const prevStatus = status;
    const nextStatus =
      prevStatus === 'programada' || prevStatus === 'confirmada' || prevStatus === 'reagendada'
        ? 'Reagendada'
        : 'Programada';

    const updated = await this.appointments.update(appointmentId, {
      date,
      time,
      notes,
      status: nextStatus,
      attendanceStatus: 'Pendiente',
    });

    await ensureCitaReminder(this.patients, actor.id, updated);

    const patientId = updated.patientId;
    if (actor.role === 'vet' && patientId) {
      const owners = await ownerRecipientIds(this.patients, patientId);
      for (const userId of owners) {
        await notifySafe({
          userId,
          patientId,
          type: 'appointment_update',
          title: `Cita aceptada: ${updated.props.petName}`,
          body: `La clínica confirmó la cita de ${updated.props.petName} para el ${date} a las ${time}. Estado: Pendiente.`,
          payload: appointmentPayload(updated, {
            proposedBy: 'vet',
            outcome: 'accepted',
            action: 'none',
          }),
        });
      }
    } else if (actor.role === 'owner') {
      await notifySafe({
        userId: updated.props.vetId,
        patientId,
        type: 'appointment_update',
        title: `Propuesta aceptada: ${updated.props.petName}`,
        body: `El dueño aceptó la cita de ${updated.props.petName} para el ${date} a las ${time}. Quedó programada (Pendiente).`,
        payload: appointmentPayload(updated, {
          proposedBy: 'owner',
          outcome: 'accepted',
          action: 'none',
        }),
      });
    }

    return updated;
  }
}

/** Reject a pending request — cancel and notify the other party. */
export class RejectAppointmentRequest {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(actor: AuthActor, appointmentId: string, data: { notes?: string } = {}) {
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment) {
      throw new DomainError('Cita no encontrada', 404);
    }

    if (actor.role === 'vet') {
      if (!appointment.belongsToVet(actor.id)) {
        throw new DomainError('Cita no encontrada', 404);
      }
    } else if (actor.role === 'owner') {
      if (!appointment.patientId) {
        throw new DomainError('Cita no encontrada', 404);
      }
      await assertOwnerOfPatient(this.patients, actor, appointment.patientId);
    } else {
      throw new DomainError('No autorizado', 403);
    }

    const status = (appointment.props.status || '').toLowerCase();
    if (status === 'eliminada' || status === 'cancelada' || status === 'completada') {
      throw new DomainError('Esta solicitud ya no se puede rechazar', 400);
    }

    const prev = appointment.props.notes ? `${appointment.props.notes}\n` : '';
    const rejectNote = data.notes?.trim() || `Rechazada por ${actor.role}`;
    const updated = await this.appointments.update(appointmentId, {
      status: 'Cancelada',
      notes: `${prev}[Rechazada] ${rejectNote}`.trim(),
    });

    const patientId = updated.patientId;
    if (actor.role === 'vet' && patientId) {
      const owners = await ownerRecipientIds(this.patients, patientId);
      for (const userId of owners) {
        await notifySafe({
          userId,
          patientId,
          type: 'appointment_update',
          title: `Cita rechazada: ${updated.props.petName}`,
          body: `La clínica rechazó la solicitud de cita de ${updated.props.petName} (${updated.props.date} ${updated.props.time}).${
            data.notes?.trim() ? ` Motivo: ${data.notes.trim()}` : ''
          }`,
          payload: appointmentPayload(updated, {
            proposedBy: 'vet',
            outcome: 'rejected',
            action: 'none',
          }),
        });
      }
    } else if (actor.role === 'owner') {
      await notifySafe({
        userId: updated.props.vetId,
        patientId,
        type: 'appointment_update',
        title: `Propuesta rechazada: ${updated.props.petName}`,
        body: `El dueño rechazó la propuesta de cita de ${updated.props.petName} (${updated.props.date} ${updated.props.time}).`,
        payload: appointmentPayload(updated, {
          proposedBy: 'owner',
          outcome: 'rejected',
          action: 'none',
        }),
      });
    }

    return updated;
  }
}

/**
 * Suggest a new date/time (vet or owner). Keeps Solicitada and notifies the other party.
 */
export class SuggestAppointmentSlot {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(
    actor: AuthActor,
    appointmentId: string,
    data: { date: string; time: string; notes?: string },
  ) {
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment) {
      throw new DomainError('Cita no encontrada', 404);
    }

    if (actor.role === 'vet') {
      if (!appointment.belongsToVet(actor.id)) {
        throw new DomainError('Cita no encontrada', 404);
      }
    } else if (actor.role === 'owner') {
      if (!appointment.patientId) {
        throw new DomainError('Cita no encontrada', 404);
      }
      await assertOwnerOfPatient(this.patients, actor, appointment.patientId);
    } else {
      throw new DomainError('No autorizado', 403);
    }

    const status = (appointment.props.status || '').toLowerCase();
    if (status === 'eliminada' || status === 'cancelada' || status === 'completada') {
      throw new DomainError('Esta cita no admite una nueva sugerencia', 400);
    }

    const proposedBy = actor.role === 'vet' ? 'vet' : 'owner';
    const prev = appointment.props.notes ? `${appointment.props.notes}\n` : '';
    const noteBit = data.notes?.trim()
      ? data.notes.trim()
      : `Nueva sugerencia (${appointment.props.date} ${appointment.props.time} → ${data.date} ${data.time})`;

    const updated = await this.appointments.update(appointmentId, {
      date: data.date,
      time: data.time,
      status: 'Solicitada',
      attendanceStatus: 'Pendiente',
      ownerConfirmedAt: null,
      notes: `${prev}[Propuesta ${proposedBy}] ${noteBit}`.trim(),
    });

    const patientId = updated.patientId;
    if (proposedBy === 'vet' && patientId) {
      const owners = await ownerRecipientIds(this.patients, patientId);
      for (const userId of owners) {
        await notifySafe({
          userId,
          patientId,
          type: 'appointment_update',
          title: `Nueva fecha sugerida: ${updated.props.petName}`,
          body: [
            `Paciente: ${updated.props.petName}`,
            `Fecha sugerida: ${data.date}`,
            `Hora: ${data.time}`,
            `Motivo: ${reasonFromNotes(updated.props.notes) || '—'}`,
            'La clínica propone otra fecha. Puedes aceptar, rechazar o sugerir otra.',
          ].join('\n'),
          payload: appointmentPayload(updated, {
            proposedBy: 'vet',
            reason: reasonFromNotes(updated.props.notes),
            action: 'review_appointment',
          }),
        });
      }
    } else if (proposedBy === 'owner') {
      await notifySafe({
        userId: updated.props.vetId,
        patientId,
        type: 'appointment_request',
        title: `Nueva sugerencia del dueño: ${updated.props.petName}`,
        body: [
          `Paciente: ${updated.props.petName}`,
          `Dueño: ${updated.props.ownerName}`,
          `Fecha sugerida: ${data.date}`,
          `Hora: ${data.time}`,
          `Motivo: ${reasonFromNotes(updated.props.notes) || '—'}`,
        ].join('\n'),
        payload: appointmentPayload(updated, {
          proposedBy: 'owner',
          reason: reasonFromNotes(updated.props.notes),
          action: 'review_appointment',
        }),
      });
    }

    return updated;
  }
}

/** Owner proposes a new date/time; stays Solicitada until the vet accepts. */
export class PostponeAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
    private readonly suggest: SuggestAppointmentSlot,
  ) {}

  async execute(
    actor: AuthActor,
    appointmentId: string,
    data: { date: string; time: string; notes?: string },
  ) {
    return this.suggest.execute(actor, appointmentId, data);
  }
}

export class ListAppointments {
  constructor(private readonly appointments: AppointmentRepository) {}

  async execute(
    actor: AuthActor,
    options: { date?: string; page?: number; limit?: number },
  ) {
    assertVet(actor);
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit = options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    return this.appointments.findByVet(actor.id, {
      date: options.date,
      page,
      limit,
    });
  }
}

export class ListAppointmentsByMonth {
  constructor(private readonly appointments: AppointmentRepository) {}

  async execute(actor: AuthActor, year: number, month: number) {
    assertVet(actor);
    if (month < 1 || month > 12) {
      throw new DomainError('month must be 1-12', 400);
    }
    return this.appointments.findByMonth(actor.id, year, month);
  }
}

export class GetAppointment {
  constructor(private readonly appointments: AppointmentRepository) {}

  async execute(actor: AuthActor, id: string) {
    assertVet(actor);
    const appointment = await this.appointments.findById(id);
    if (!appointment || !appointment.belongsToVet(actor.id)) {
      throw new DomainError('Cita no encontrada', 404);
    }
    return appointment;
  }
}

export class UpdateAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(actor: AuthActor, id: string, data: Record<string, unknown>) {
    assertVet(actor);
    const appointment = await this.appointments.findById(id);
    if (!appointment || !appointment.belongsToVet(actor.id)) {
      throw new DomainError('Cita no encontrada', 404);
    }

    const next = { ...data } as {
      petName?: string;
      ownerName?: string;
      date?: string;
      time?: string;
      notes?: string | null;
      status?: string;
      patientId?: string | null;
    };

    if (next.patientId) {
      const patient = await this.patients.findById(next.patientId);
      if (!patient || !patient.belongsToVet(actor.id)) {
        throw new DomainError('Paciente no encontrado', 404);
      }
      next.petName = next.petName ?? patient.props.name;
      next.ownerName = next.ownerName ?? patient.props.ownerName;
    }

    return this.appointments.update(id, next);
  }
}

export class DeleteAppointment {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly patients: PatientRepository,
  ) {}

  async execute(actor: AuthActor, id: string) {
    assertVet(actor);
    const appointment = await this.appointments.findById(id);
    if (!appointment || !appointment.belongsToVet(actor.id)) {
      throw new DomainError('Cita no encontrada', 404);
    }
    const stamp = new Date().toISOString();
    const prevNotes = appointment.props.notes ? `${appointment.props.notes}\n` : '';
    const updated = await this.appointments.update(id, {
      status: 'Eliminada',
      notes: `${prevNotes}[Eliminada ${stamp}]`.trim(),
    });

    const patientId = appointment.patientId;
    if (patientId) {
      const reminders = await this.patients.listReminders(patientId);
      for (const rem of reminders) {
        if (rem.appointmentId === id || (rem.type === 'cita' && rem.date === appointment.props.date)) {
          await this.patients.updateReminder(rem.id, {
            completed: true,
            completedAt: new Date(),
            notes: `${rem.notes ? rem.notes + '\n' : ''}[Cita eliminada por la clínica]`,
          });
        }
      }
    }

    return updated;
  }
}
