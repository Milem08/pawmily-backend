import { DomainError } from '../../domain/shared/DomainError';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import { AuthActor, authorizePatientAction } from '../access/authorizePatientAction';
import { createMedicationDoseReminders, parseIntervalHours } from './MedicationDoseReminders';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Owner (or caregiver) schedules dose reminders after reading a prescription
 * in Correo clínico / medical report. First dose time is chosen by the user.
 */
export class ScheduleMedicationReminders {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(
    actor: AuthActor,
    petId: string,
    recordId: string,
    data: {
      firstDoseDate: string;
      firstDoseTime: string;
      intervalHours?: number;
      durationDays?: number;
    },
  ) {
    const action =
      actor.role === 'vet' ? 'WRITE_MEDICAL_REMINDER' : 'WRITE_PERSONAL_REMINDER';
    const { patient } = await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      petId,
      action,
    );

    const record = await this.patients.findMedicalRecordById(recordId);
    if (!record || record.petId !== petId) {
      throw new DomainError('Consulta no encontrada', 404);
    }

    const payload =
      record.typePayload && typeof record.typePayload === 'object'
        ? (record.typePayload as Record<string, unknown>)
        : {};

    const medName =
      asString(record.medication) ||
      asString(payload.medication) ||
      asString(payload.vaccine) ||
      asString(payload.product);
    if (!medName) {
      throw new DomainError('Esta consulta no tiene medicamento para programar', 400);
    }

    const frequency =
      asString(payload.medFrequency) ||
      asString(payload.frequency) ||
      asString(payload.dosingFrequency) ||
      'cada 12 h';

    const created = await createMedicationDoseReminders(
      this.patients,
      petId,
      actor.id,
      patient.props.name,
      {
        medication: record.medication,
        date: record.date,
        time: record.time,
        typePayload: payload,
        consultationNumber: record.consultationNumber,
        firstDoseDate: data.firstDoseDate,
        firstDoseTime: data.firstDoseTime,
        intervalHours: data.intervalHours ?? parseIntervalHours(frequency),
        durationDays: data.durationDays,
      },
    );

    if (created === 0) {
      throw new DomainError('No se pudieron crear los recordatorios de dosis', 400);
    }

    // Confirm to other caregivers (skip the actor who just scheduled).
    try {
      const grants = await this.accesses.listActiveForPatient(petId);
      const recipients = new Set<string>();
      if (patient.props.ownerUserId) recipients.add(patient.props.ownerUserId);
      for (const g of grants) recipients.add(g.userId);
      recipients.delete(actor.id);

      const { createClinicMessage } = await import('../inbox/ClinicInbox');
      for (const userId of recipients) {
        await createClinicMessage({
          userId,
          patientId: petId,
          type: 'general',
          title: `Tomas programadas: ${medName}`,
          body: `Se programaron ${created} tomas de ${medName} para ${patient.props.name} a partir de ${data.firstDoseDate} ${data.firstDoseTime}.`,
          payload: {
            patientId: petId,
            recordId,
            medication: medName,
            reminderCount: created,
          },
        });
      }
    } catch {
      // Non-blocking
    }

    return { created, medication: medName };
  }
}
