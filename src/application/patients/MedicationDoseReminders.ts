import { PatientRepository } from '../../domain/patients/PatientRepository';
import { buildReminderNotificationMessage } from '../../domain/patients/NotificationMessage';

type Payload = Record<string, unknown> | null | undefined;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDurationDays(raw: string): number {
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n <= 0) return 7;
  return Math.min(n, 30);
}

/** Hours between doses from free-text frequency. */
export function parseIntervalHours(raw: string): number {
  const text = raw.toLowerCase();
  const every = text.match(/cada\s+(\d+)\s*h/);
  if (every) return Math.max(1, Number(every[1]));
  if (text.includes('12')) return 12;
  if (text.includes('8')) return 8;
  if (text.includes('6')) return 6;
  if (text.includes('24') || text.includes('diario') || text.includes('día') || text.includes('dia')) {
    return 24;
  }
  if (text.includes('2 veces') || text.includes('dos veces')) return 12;
  if (text.includes('3 veces') || text.includes('tres veces')) return 8;
  return 12;
}

function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function toDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toTimeHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type ScheduleMedicationOptions = {
  medication?: string | null;
  date: string;
  time?: string | null;
  typePayload?: Payload;
  consultationNumber?: string;
  /** Explicit first dose overrides (owner/vet schedules when they know the start time). */
  firstDoseDate?: string;
  firstDoseTime?: string;
  intervalHours?: number;
  durationDays?: number;
};

/**
 * Creates one reminder per dose from consult medication + schedule options.
 * Caps at 60 reminders to protect school/demo environments.
 * Does NOT run automatically on consult save — call from schedule endpoint.
 */
export async function createMedicationDoseReminders(
  patients: PatientRepository,
  petId: string,
  actorId: string,
  petName: string,
  data: ScheduleMedicationOptions,
): Promise<number> {
  const payload = (data.typePayload && typeof data.typePayload === 'object'
    ? data.typePayload
    : {}) as Record<string, unknown>;

  const medName =
    asString(data.medication) ||
    asString(payload.medication) ||
    asString(payload.vaccine) ||
    asString(payload.product);
  if (!medName) return 0;

  const dose = asString(payload.dose) || asString(payload.medDose);
  const frequency =
    asString(payload.medFrequency) ||
    asString(payload.frequency) ||
    asString(payload.dosingFrequency) ||
    'cada 12 h';
  const durationRaw =
    asString(payload.duration) || asString(payload.days) || asString(payload.treatmentDays) || '7';

  const intervalH =
    typeof data.intervalHours === 'number' && data.intervalHours > 0
      ? Math.min(Math.max(1, Math.round(data.intervalHours)), 48)
      : parseIntervalHours(frequency);
  const days =
    typeof data.durationDays === 'number' && data.durationDays > 0
      ? Math.min(Math.max(1, Math.round(data.durationDays)), 30)
      : parseDurationDays(durationRaw);
  const dosesPerDay = Math.max(1, Math.round(24 / intervalH));
  const total = Math.min(days * dosesPerDay, 60);

  const startDate = (data.firstDoseDate || data.date).slice(0, 10);
  const startTime = (data.firstDoseTime || data.time || '09:00').slice(0, 5);
  const start = new Date(`${startDate}T${startTime}:00`);
  if (Number.isNaN(start.getTime())) return 0;

  let created = 0;
  for (let i = 0; i < total; i++) {
    const when = addHours(start, i * intervalH);
    const date = toDateIso(when);
    const time = toTimeHm(when);
    const title = `Medicamento: ${medName}`;
    const description = [dose, frequency, data.consultationNumber].filter(Boolean).join(' · ');
    const notificationMessage = buildReminderNotificationMessage({
      type: 'recordatorio',
      title,
      category: 'medicamento',
      petName,
      date,
      time,
    });
    await patients.addReminder(petId, {
      title,
      description,
      date,
      time,
      type: 'recordatorio',
      category: 'medicamento',
      createdByUserId: actorId,
      notificationMessage,
      notes: `Dosis ${i + 1}/${total}`,
    });
    created += 1;
  }
  return created;
}
