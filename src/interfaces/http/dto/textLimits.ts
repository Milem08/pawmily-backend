import { z } from 'zod';
import { DomainError } from '../../../domain/shared/DomainError';

/**
 * Topes de texto de entrada. Los valores salen de la tabla común.
 * Los que no tenían casilla propia usan el tope más cercano y quedan anotados
 * en FIELD_LIMIT_NOTES.
 */
export const LIMIT = {
  personName: 80,
  petName: 50,
  trait: 50,
  email: 254,
  phone: 20,
  password: 72,
  /** Login y contraseña actual: cuentas anteriores pudieron usar más de 72. */
  existingPassword: 1024,
  address: 200,
  license: 50,
  clinicName: 100,
  itemName: 100,
  dose: 100,
  appointmentReason: 500,
  subject: 150,
  messageBody: 5000,
  notes: 2000,
  search: 100,
  patientCode: 20,
  /** Cuid (~25) y token de verificación (43). El código de paciente (20) no cabe. */
  identifier: 50,
  /** Token de refresco opaco: 64 caracteres. 50 no cabe; 100 es el tope de la tabla que sí cabe. */
  refreshToken: 100,
  /** «8:30 p. m.» y fechas ISO no caben en 20. */
  dateTime: 50,
  /** Un enlace de mapa no cabe en 200. */
  mapUrl: 2000,
} as const;

export const FIELD_LIMIT_NOTES: Record<string, string> = {
  'auth.name / perfil.name / vetName / ownerName / responsibleName': '80 nombre de persona',
  'paciente.name / citas.petName': '50 nombre de mascota',
  'species / breed / color / age / sex / status / category corta / icon / language / timezone / dateFormat / theme / formulaVersion':
    '50 especie/raza/color (etiqueta corta)',
  email: '254 correo',
  'phone / ownerPhone / clinicPhone': '20 teléfono',
  'password nueva (registro, cambio, restablecer)': '72 contraseña (el mínimo no cambia)',
  'login.password / currentPassword': '1024 tope anti-abuso; no es el máximo de una contraseña nueva',
  'address / clinicAddress / clinicHours': '200 dirección (clinicHours es horario corto)',
  'license / microchip': '50 número de licencia/registro',
  'clinic / clinicName / foodType / brand / meal.label / meal.food': '100 nombre de clínica o de alimento',
  'medication / vaccine / product': '100 nombre de medicamento o vacuna',
  'dose / frequency / quantity / amount / recommendedAmount / weight / temperature / heartRate / respiratoryRate':
    '100 dosis/frecuencia/cantidad',
  'citas.notes / consultas.reason / objective': '500 motivo de cita (las notas de la cita se muestran como motivo)',
  'recordatorio.title': '150 asunto (título corto; no es un nombre de persona)',
  'clinicMessage.title / clinicMessage.body': '150 asunto y 5000 cuerpo (no hay endpoint de escritura; el esquema queda listo)',
  'notes / description / observations / diagnosis / treatment / prescriptions / physicalExam / results / privateNotes / vetNotes / specialInstructions / restrictions / allergies / allowedFoods / forbiddenFoods / schedule':
    '2000 notas (las listas de alimentos no caben en 100)',
  'query.search': '100 búsquedas',
  'link.code': '20 código de paciente',
  'ids cuid / assetId / token de restablecimiento': '50 licencia (20 no cabe)',
  refreshToken: '100 búsquedas (el token mide 64; 50 y 72 no se usaron: 72 es el tope de contraseña y queda justo)',
  'fechas y horas de texto': '50 licencia',
  mapUrl: '2000 notas',
  'photo / photoUrl / imageBase64': 'sin tope de texto: data URL, URL firmada o binario',
};

export function lengthMessage(campo: string, max: number): string {
  return `El campo «${campo}» no puede superar ${max} caracteres.`;
}

export function txt(max: number, campo: string) {
  return z.string().max(max, lengthMessage(campo, max));
}

export function opt(max: number, campo: string) {
  return txt(max, campo).optional();
}

export function optNull(max: number, campo: string) {
  return txt(max, campo).optional().nullable();
}

export function emailField(campo = 'correo') {
  return z.string().max(LIMIT.email, lengthMessage(campo, LIMIT.email)).email();
}

/** Vacío o correo. El tope se evalúa antes del formato. */
export function optionalEmail(campo: string) {
  return z
    .string()
    .max(LIMIT.email, lengthMessage(campo, LIMIT.email))
    .refine((value) => value === '' || z.string().email().safeParse(value).success, 'Invalid email')
    .optional();
}

export function passwordField(min: number, campo = 'contraseña', max: number = LIMIT.password) {
  return z.string().min(min).max(max, lengthMessage(campo, max));
}

const PAYLOAD_STRING_LIMITS: Record<string, { max: number; campo: string }> = {
  medication: { max: LIMIT.itemName, campo: 'medicamento' },
  vaccine: { max: LIMIT.itemName, campo: 'vacuna' },
  product: { max: LIMIT.itemName, campo: 'producto' },
  dose: { max: LIMIT.dose, campo: 'dosis' },
  medDose: { max: LIMIT.dose, campo: 'dosis' },
  frequency: { max: LIMIT.dose, campo: 'frecuencia' },
  medFrequency: { max: LIMIT.dose, campo: 'frecuencia' },
  dosingFrequency: { max: LIMIT.dose, campo: 'frecuencia' },
  quantity: { max: LIMIT.dose, campo: 'cantidad' },
  amount: { max: LIMIT.dose, campo: 'cantidad' },
  duration: { max: LIMIT.dose, campo: 'duración' },
  days: { max: LIMIT.dose, campo: 'días' },
  treatmentDays: { max: LIMIT.dose, campo: 'días de tratamiento' },
  reason: { max: LIMIT.appointmentReason, campo: 'motivo' },
  diagnosis: { max: LIMIT.notes, campo: 'diagnóstico' },
  treatment: { max: LIMIT.notes, campo: 'tratamiento' },
  observations: { max: LIMIT.notes, campo: 'observaciones' },
  notes: { max: LIMIT.notes, campo: 'notas' },
};

/** Limita textos sueltos dentro de typePayload (medicamento, vacuna, dosis, notas). */
export function refinePayloadStrings(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'string') {
    const key = String(path[path.length - 1] ?? 'texto');
    const rule = PAYLOAD_STRING_LIMITS[key] ?? { max: LIMIT.notes, campo: key };
    if (value.length > rule.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: lengthMessage(rule.campo, rule.max),
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => refinePayloadStrings(item, ctx, [...path, index]));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      refinePayloadStrings(nested, ctx, [...path, key]);
    }
  }
}

export const searchQuerySchema = z
  .string()
  .max(LIMIT.search, lengthMessage('búsqueda', LIMIT.search));

export const clinicMessageSchema = z.object({
  title: txt(LIMIT.subject, 'asunto').min(1),
  body: txt(LIMIT.messageBody, 'mensaje').min(1),
});

export function parseOptionalSearch(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const parsed = searchQuerySchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(
      parsed.error.errors[0]?.message ?? lengthMessage('búsqueda', LIMIT.search),
      400,
      'VALIDATION_ERROR',
    );
  }
  return parsed.data;
}
