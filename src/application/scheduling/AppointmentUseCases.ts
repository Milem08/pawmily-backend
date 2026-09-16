import { DomainError } from '../../domain/shared/DomainError';
import { AppointmentRepository } from '../../domain/scheduling/AppointmentRepository';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { buildReminderNotificationMessage } from '../../domain/patients/NotificationMessage';
import { Role } from '../../domain/identity/Role';

export interface AuthActor {
  id: string;
  role: Role;
}

function assertVet(actor: AuthActor) {
  if (actor.role !== 'vet') {
    throw new DomainError('Solo veterinarios pueden gestionar citas', 403);
  }
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
      const notificationMessage = buildReminderNotificationMessage({
        type: 'cita',
        title: `Cita: ${petName}`,
        category: 'cita',
        petName,
        date: data.date,
        time: data.time,
      });
      await this.patients.addReminder(patientId, {
        title: `Cita: ${petName}`,
        date: data.date,
        time: data.time,
        type: 'cita',
        category: 'cita',
        appointmentId: appointment.id,
        createdByUserId: actor.id,
        notificationMessage,
      });
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
    const patient = await this.patients.findById(appointment.patientId);
    if (!patient) {
      throw new DomainError('Cita no encontrada', 404);
    }
    const accessible = await this.patients.findByOwner(actor.id, { page: 1, limit: 500 });
    if (!accessible.items.some((p) => p.id === patient.id)) {
      throw new DomainError('No autorizado', 403);
    }
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
    const accessible = await this.patients.findByOwner(actor.id, { page: 1, limit: 500 });
    if (!accessible.items.some((p) => p.id === patient.id)) {
      throw new DomainError('No autorizado', 403);
    }
    const vetId = patient.props.vetId;
    if (!vetId) {
      throw new DomainError('La mascota no tiene veterinario asignado', 400);
    }

    return this.appointments.create({
      petName: patient.props.name,
      ownerName: patient.props.ownerName,
      date: data.date,
      time: data.time,
      notes: data.notes?.trim() || 'Solicitud del dueño',
      vetId,
      patientId: patient.id,
      status: 'Solicitada',
      attendanceStatus: 'Pendiente',
    });
  }
}

/**
 * Vet accepts a Solicitada request (or any pending request): marks Programada
 * and creates the linked cita reminder when a patient is attached.
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
    assertVet(actor);
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment || !appointment.belongsToVet(actor.id)) {
      throw new DomainError('Cita no encontrada', 404);
    }

    const date = data.date ?? appointment.props.date;
    const time = data.time ?? appointment.props.time;
    const notes = data.notes !== undefined ? data.notes : appointment.props.notes;

    const prevStatus = (appointment.props.status || '').toLowerCase();
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

    const patientId = updated.patientId;
    if (patientId) {
      const petName = updated.props.petName;
      const notificationMessage = buildReminderNotificationMessage({
        type: 'cita',
        title: `Cita: ${petName}`,
        category: 'cita',
        petName,
        date,
        time,
      });
      await this.patients.addReminder(patientId, {
        title: `Cita: ${petName}`,
        date,
        time,
        type: 'cita',
        category: 'cita',
        appointmentId: updated.id,
        createdByUserId: actor.id,
        notificationMessage,
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
  ) {}

  async execute(
    actor: AuthActor,
    appointmentId: string,
    data: { date: string; time: string; notes?: string },
  ) {
    if (actor.role !== 'owner') {
      throw new DomainError('Solo dueños pueden aplazar citas', 403);
    }
    const appointment = await this.appointments.findById(appointmentId);
    if (!appointment || !appointment.patientId) {
      throw new DomainError('Cita no encontrada', 404);
    }
    const patient = await this.patients.findById(appointment.patientId);
    if (!patient) {
      throw new DomainError('Cita no encontrada', 404);
    }
    const accessible = await this.patients.findByOwner(actor.id, { page: 1, limit: 500 });
    if (!accessible.items.some((p) => p.id === patient.id)) {
      throw new DomainError('No autorizado', 403);
    }
    const status = (appointment.props.status || '').toLowerCase();
    if (status === 'eliminada' || status === 'cancelada' || status === 'completada') {
      throw new DomainError('Esta cita no se puede aplazar', 400);
    }

    const prev = appointment.props.notes ? `${appointment.props.notes}\n` : '';
    const noteBit = data.notes?.trim()
      ? data.notes.trim()
      : `Propuesta de aplazamiento (${appointment.props.date} ${appointment.props.time} → ${data.date} ${data.time})`;

    return this.appointments.update(appointmentId, {
      date: data.date,
      time: data.time,
      status: 'Solicitada',
      attendanceStatus: 'Pendiente',
      ownerConfirmedAt: null,
      notes: `${prev}[Aplazamiento] ${noteBit}`.trim(),
    });
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
    // Soft-cancel: keep a registry entry instead of hard-deleting.
    const stamp = new Date().toISOString();
    const prevNotes = appointment.props.notes ? `${appointment.props.notes}\n` : '';
    const updated = await this.appointments.update(id, {
      status: 'Eliminada',
      notes: `${prevNotes}[Eliminada ${stamp}]`.trim(),
    });

    // Hide linked cita reminders so owners no longer see the slot.
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
