import { ReminderProps } from './Patient';

function categoryKey(reminder: { type?: string | null; category?: string | null }): string {
  return String(reminder.category || '').toLowerCase();
}

export function isAppointmentReminder(reminder: {
  type?: string | null;
  category?: string | null;
}): boolean {
  return reminder.type === 'cita' || categoryKey(reminder) === 'cita';
}

/** Shared clinical reminders: vet may create via consult/diet; owner sees and manages them. */
export function isFoodOrMedicationReminder(reminder: { category?: string | null }): boolean {
  const category = categoryKey(reminder);
  return (
    category === 'medicamento' ||
    category === 'alimento' ||
    category === 'alimentacion' ||
    category === 'comida'
  );
}

/**
 * Vet: appointments only.
 * Owner/co-owner: own personal reminders + food/medication. Citas live on the appointments API.
 */
export function visibleRemindersForActor<T extends Pick<ReminderProps, 'type' | 'category' | 'createdByUserId'>>(
  reminders: T[],
  actorId: string,
  petRole: string | null,
  actorRole?: string,
): T[] {
  const isVet = petRole === 'VET' || actorRole === 'vet';
  if (isVet) {
    return reminders.filter(isAppointmentReminder);
  }

  return reminders.filter((reminder) => {
    if (isAppointmentReminder(reminder)) return false;
    if (isFoodOrMedicationReminder(reminder)) return true;
    return !reminder.createdByUserId || reminder.createdByUserId === actorId;
  });
}
