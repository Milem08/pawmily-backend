/**
 * Marcas que solo escribe el servidor dentro de Appointment.notes.
 * El texto del usuario se limpia antes de guardarse; estas marcas sirven
 * para saber quién propuso y qué le pasó a la cita.
 */
const INTERNAL_TAG =
  /\[\s*(?:propuesta\s+(?:vet|owner)|aplazamiento|rechazada|cancelada\b[^\]]*|eliminada\b[^\]]*|cita\s+cancelada\s+por\s+la\s+cl[ií]nica)\s*\]/gi;

const PROPOSAL_TAG = /\[\s*propuesta\s+(vet|owner)\s*\]/gi;

export type ProposalAuthor = 'vet' | 'owner';

/** Quita marcas internas. Un corchete que no es marca (por ejemplo [urgente]) se conserva. */
export function stripInternalTags(text: string): string {
  return text
    .replace(new RegExp(INTERNAL_TAG.source, 'gi'), ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractInternalTags(text: string | null | undefined): string[] {
  if (!text) return [];
  return text.match(new RegExp(INTERNAL_TAG.source, 'gi')) ?? [];
}

/** Texto nuevo del usuario, más las marcas que el servidor ya había escrito. */
export function notesPreservingInternalTags(
  existing: string | null | undefined,
  incoming: string,
): string {
  const cleaned = stripInternalTags(incoming);
  const tags = extractInternalTags(existing);
  return [cleaned, ...tags].filter((part) => part.trim().length > 0).join('\n').trim();
}

/**
 * Última marca [Propuesta vet] o [Propuesta owner].
 * Sin marca, la cita la propuso el dueño (POST /appointments/request no escribe marca).
 */
export function lastProposalBy(notes: string | null | undefined): ProposalAuthor | null {
  if (!notes) return null;
  const re = new RegExp(PROPOSAL_TAG.source, 'gi');
  let found: ProposalAuthor | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(notes)) !== null) {
    found = match[1].toLowerCase() === 'vet' ? 'vet' : 'owner';
  }
  return found;
}

const CANONICAL_STATUSES: Record<string, string> = {
  solicitada: 'Solicitada',
  programada: 'Programada',
  reagendada: 'Reagendada',
  confirmada: 'Confirmada',
  completada: 'Completada',
};

/** 'Eliminada' se guarda como Cancelada. Cualquier otro texto no es un estado. */
export function canonicalAppointmentStatus(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (key === 'eliminada' || key === 'cancelada') return 'Cancelada';
  return CANONICAL_STATUSES[key] ?? null;
}

export function occupiesAppointmentSlot(status: string | null | undefined): boolean {
  const key = (status || '').trim().toLowerCase();
  return key !== 'cancelada' && key !== 'eliminada';
}
