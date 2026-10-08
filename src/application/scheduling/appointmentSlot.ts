import { DomainError } from '../../domain/shared/DomainError';
import {
  isBusinessDate,
  isBusinessTime,
  isLocalDateTimeInPast,
} from '../../shared/businessTime';

/** Fecha real AAAA-MM-DD, hora HH:MM, y no anterior a ahora en la zona del negocio. */
export function assertBookableAppointmentSlot(
  date: string,
  time: string,
  now: Date = new Date(),
): void {
  if (!isBusinessDate(date)) {
    throw new DomainError('La fecha debe ser real y tener el formato AAAA-MM-DD', 400);
  }
  if (!isBusinessTime(time)) {
    throw new DomainError('La hora debe ser válida y tener el formato HH:MM', 400);
  }
  if (isLocalDateTimeInPast(date, time, now, 0)) {
    throw new DomainError('La fecha y hora no pueden estar en el pasado', 400);
  }
}
