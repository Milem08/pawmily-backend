export const CONSULTATION_TYPES = [
  'GENERAL',
  'PREVENTIVA',
  'VACUNACION',
  'DESPARASITACION',
  'ENFERMEDAD',
  'TRAUMATOLOGIA',
  'REPRODUCTIVA',
  'SEGUIMIENTO',
] as const;

export type ConsultationType = (typeof CONSULTATION_TYPES)[number];

export function isConsultationType(value: string): value is ConsultationType {
  return (CONSULTATION_TYPES as readonly string[]).includes(value);
}

export function formatConsultationNumber(seq: number): string {
  return `CONS-${String(seq).padStart(6, '0')}`;
}

/** Owner-facing projection keys per consult type (brief §14). */
export function ownerVisibleFields(type: ConsultationType): string[] {
  const common = ['id', 'consultationNumber', 'type', 'date', 'time', 'vetName', 'status'];
  switch (type) {
    case 'GENERAL':
      return [...common, 'reason', 'diagnosis', 'observations', 'treatment'];
    case 'PREVENTIVA':
      return [...common, 'weightAtVisit', 'observations', 'followUpDate', 'typePayload'];
    case 'VACUNACION':
      return [...common, 'medication', 'followUpDate', 'observations', 'typePayload'];
    case 'DESPARASITACION':
      return [...common, 'medication', 'treatment', 'followUpDate', 'typePayload'];
    case 'ENFERMEDAD':
      return [...common, 'diagnosis', 'treatment', 'medication', 'observations'];
    case 'TRAUMATOLOGIA':
      return [...common, 'diagnosis', 'treatment', 'observations', 'typePayload'];
    case 'REPRODUCTIVA':
      return [...common, 'diagnosis', 'observations', 'typePayload'];
    case 'SEGUIMIENTO':
      return [...common, 'observations', 'treatment', 'followUpDate', 'typePayload'];
    default:
      return [...common, 'reason', 'diagnosis', 'treatment'];
  }
}

export function toOwnerConsultationView(record: Record<string, unknown>) {
  const type = (typeof record.type === 'string' && isConsultationType(record.type)
    ? record.type
    : 'GENERAL') as ConsultationType;
  const allowed = new Set(ownerVisibleFields(type));
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in record) out[key] = record[key];
  }
  // Friendly aliases for owner UI
  out.motivo = out.reason ?? null;
  out.recomendaciones = out.observations ?? out.treatment ?? null;
  return out;
}

export function toVetConsultationView(record: Record<string, unknown>) {
  return { ...record };
}
