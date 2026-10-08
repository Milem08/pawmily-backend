import { DomainError } from '../../domain/shared/DomainError';
import { PatientRepository, CreateReminderData } from '../../domain/patients/PatientRepository';
import { medicationDoseMark } from '../../domain/patients/medicationDoseMark';
import { buildReminderNotificationMessage } from '../../domain/patients/NotificationMessage';
import {
  addHoursToLocalDateTime,
  isBusinessDate,
  isBusinessTime,
  isLocalDateTimeInPast,
} from '../../shared/businessTime';

type Payload = Record<string, unknown> | null | undefined;

/** Enough for an 8-hour course of about 40 days. Above this we refuse instead of trimming. */
export const MAX_MEDICATION_DOSES = 120;

const TIMES_PER_DAY_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hoursFromTimesPerDay(times: number): number {
  if (!Number.isFinite(times) || times < 1) {
    throw new DomainError('Indica cada cuántas horas', 400);
  }
  return 24 / times;
}

/**
 * Hours between doses.
 * Order: cada N horas → N; N veces al día → 24/N; una vez al día or diario → 24; cada N días → 24·N.
 * "por N días" is the length of the course, not the gap.
 */
export function parseIntervalHours(raw: string): number {
  const text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const everyHours = text.match(/cada\s+(\d+)\s*(?:horas?|hrs?|h)\b/);
  if (everyHours) {
    const hours = Number(everyHours[1]);
    if (hours < 1) throw new DomainError('Indica cada cuántas horas', 400);
    return hours;
  }

  const timesDigit = text.match(/(\d+)\s*veces?\s+al\s+d[ií]a\b/);
  if (timesDigit) return hoursFromTimesPerDay(Number(timesDigit[1]));

  const timesWord = text.match(
    /\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)\s+veces?\s+al\s+d[ií]a\b/,
  );
  if (timesWord) return hoursFromTimesPerDay(TIMES_PER_DAY_WORDS[timesWord[1]]);

  if (/\b(una|uno|un)\s+vez\s+al\s+d[ií]a\b/.test(text) || /\bdiari[oa]\b/.test(text)) {
    return 24;
  }

  const everyDays = text.match(/cada\s+(\d+)\s*d[ií]as?\b/);
  if (everyDays) {
    const days = Number(everyDays[1]);
    if (days < 1) throw new DomainError('Indica cada cuántas horas', 400);
    return 24 * days;
  }

  throw new DomainError('Indica cada cuántas horas', 400);
}

/** Days of treatment from "por/durante N días" or a duration field that is only a number. */
export function parseDurationDays(frequencyText: string, durationText: string): number | null {
  const labeled = (text: string) => {
    const match = text.toLowerCase().match(/(?:por|durante)\s+(\d+)\s*d[ií]as?\b/);
    if (!match) return null;
    const days = Number(match[1]);
    return days > 0 ? days : null;
  };
  const fromFrequency = labeled(frequencyText);
  if (fromFrequency) return fromFrequency;
  const fromDuration = labeled(durationText);
  if (fromDuration) return fromDuration;
  const only = durationText.trim().match(/^(\d+)\s*(?:d[ií]as?)?$/i);
  if (!only) return null;
  const days = Number(only[1]);
  return days > 0 ? days : null;
}

export function medicationDoseCount(durationDays: number, intervalHours: number): number {
  if (!(durationDays > 0) || !(intervalHours > 0) || !Number.isFinite(intervalHours)) {
    throw new DomainError('Indica cada cuántas horas', 400);
  }
  const total = Math.ceil((durationDays * 24) / intervalHours);
  if (total > MAX_MEDICATION_DOSES) {
    throw new DomainError(
      `Este tratamiento son ${total} tomas y el máximo permitido es ${MAX_MEDICATION_DOSES}. Indica menos días o más horas entre tomas.`,
      400,
    );
  }
  return total;
}

export function resolveMedicationPlan(input: {
  frequencyText?: string;
  durationText?: string;
  intervalHours?: number;
  durationDays?: number;
}): { intervalHours: number; durationDays: number; total: number } {
  const frequencyText = (input.frequencyText || '').trim();
  const durationText = (input.durationText || '').trim();

  let intervalHours = input.intervalHours;
  if (!(typeof intervalHours === 'number' && intervalHours > 0 && Number.isFinite(intervalHours))) {
    if (!frequencyText) throw new DomainError('Indica cada cuántas horas', 400);
    intervalHours = parseIntervalHours(frequencyText);
  }

  let durationDays = input.durationDays;
  if (!(typeof durationDays === 'number' && durationDays > 0 && Number.isFinite(durationDays))) {
    durationDays = parseDurationDays(frequencyText, durationText) ?? 7;
  } else {
    durationDays = Math.round(durationDays);
  }

  const total = medicationDoseCount(durationDays, intervalHours);
  return { intervalHours, durationDays, total };
}

export function buildMedicationDoseSlots(
  firstDate: string,
  firstTime: string,
  intervalHours: number,
  total: number,
): Array<{ date: string; time: string }> {
  const slots: Array<{ date: string; time: string }> = [];
  for (let i = 0; i < total; i++) {
    slots.push(addHoursToLocalDateTime(firstDate, firstTime, i * intervalHours));
  }
  return slots;
}

export type ScheduleMedicationOptions = {
  medication?: string | null;
  date: string;
  time?: string | null;
  typePayload?: Payload;
  consultationNumber?: string;
  recordId: string;
  /** Explicit first dose overrides (owner/vet schedules when they know the start time). */
  firstDoseDate?: string;
  firstDoseTime?: string;
  intervalHours?: number;
  durationDays?: number;
};

/**
 * Replaces pending dose reminders for this consultation and creates the new course.
 * Does NOT run automatically on consult save — call from the schedule endpoint.
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
    asString(payload.dosingFrequency);
  const durationText =
    asString(payload.duration) || asString(payload.days) || asString(payload.treatmentDays);

  const plan = resolveMedicationPlan({
    frequencyText: frequency,
    durationText,
    intervalHours: data.intervalHours,
    durationDays: data.durationDays,
  });

  const startDate = (data.firstDoseDate || '').trim();
  const startTime = (data.firstDoseTime || '').trim();
  if (!isBusinessDate(startDate) || !isBusinessTime(startTime)) {
    throw new DomainError('Indica la fecha (AAAA-MM-DD) y la hora (HH:MM) de la primera toma', 400);
  }
  if (isLocalDateTimeInPast(startDate, startTime)) {
    throw new DomainError('La primera toma no puede estar en el pasado', 400);
  }

  const slots = buildMedicationDoseSlots(
    startDate,
    startTime,
    plan.intervalHours,
    plan.total,
  );
  const mark = medicationDoseMark(data.recordId);
  const description = [dose, frequency, data.consultationNumber].filter(Boolean).join(' · ');
  const doses: CreateReminderData[] = slots.map((slot, i) => {
    const title = `Medicamento: ${medName}`;
    const notificationMessage = buildReminderNotificationMessage({
      type: 'recordatorio',
      title,
      category: 'medicamento',
      petName,
      date: slot.date,
      time: slot.time,
    });
    return {
      title,
      description,
      date: slot.date,
      time: slot.time,
      type: 'recordatorio',
      category: 'medicamento',
      createdByUserId: actorId,
      notificationMessage,
      notes: `${mark} · Dosis ${i + 1}/${plan.total}`,
    };
  });

  return patients.replacePendingMedicationDoses(
    petId,
    { recordId: data.recordId, consultationNumber: data.consultationNumber },
    doses,
  );
}
