export type ReminderMessageInput = {
  type: string;
  title: string;
  category?: string | null;
  petName: string;
  date: string;
  time?: string | null;
};

function isToday(date: string): boolean {
  return date === new Date().toISOString().slice(0, 10);
}

function isTomorrow(date: string): boolean {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return date === d.toISOString().slice(0, 10);
}

/** Builds Spanish notification copy for reminders and appointments. */
export function buildReminderNotificationMessage(input: ReminderMessageInput): string {
  const pet = input.petName || 'tu mascota';
  const category = (input.category || input.title || '').toLowerCase();

  if (input.type === 'cita') {
    if (isToday(input.date)) {
      return `Hoy tienes una cita veterinaria con ${pet}${input.time ? ` a las ${input.time}` : ''}.`;
    }
    if (isTomorrow(input.date)) {
      return `Mañana tienes una cita veterinaria con ${pet}${input.time ? ` a las ${input.time}` : ''}.`;
    }
    return `Tienes una cita veterinaria con ${pet} el ${input.date}${input.time ? ` a las ${input.time}` : ''}.`;
  }

  if (category.includes('vacun')) {
    return isToday(input.date)
      ? `Hoy toca vacunar a ${pet}.`
      : `Recuerda vacunar a ${pet} el ${input.date}.`;
  }
  if (category.includes('medic') || category.includes('vitamina')) {
    return `Recuerda darle el medicamento a ${pet}.`;
  }
  if (category.includes('baño') || category.includes('bano')) {
    return isToday(input.date)
      ? `Es hora del baño de ${pet}.`
      : `Recuerda el baño de ${pet} el ${input.date}.`;
  }
  if (category.includes('paseo')) {
    return `Es hora del paseo de ${pet}.`;
  }
  if (category.includes('alimento') || category.includes('comida')) {
    return `Recuerda comprar alimento para ${pet}.`;
  }
  if (category.includes('uña') || category.includes('una')) {
    return `Recuerda cortar las uñas de ${pet}.`;
  }

  if (isToday(input.date)) {
    return `Hoy: ${input.title} — ${pet}.`;
  }
  if (isTomorrow(input.date)) {
    return `Mañana: ${input.title} — ${pet}.`;
  }
  return `${input.title} — ${pet} (${input.date}${input.time ? ` ${input.time}` : ''}).`;
}
