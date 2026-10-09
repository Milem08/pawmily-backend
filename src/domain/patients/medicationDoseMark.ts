/** Ties dose reminders to a consultation without a new column. */
export function medicationDoseMark(recordId: string): string {
  return `receta:${recordId}`;
}
