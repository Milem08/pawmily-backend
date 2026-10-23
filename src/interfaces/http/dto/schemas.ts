import { z } from 'zod';
import { DIET_LIMITS, DIET_LIMIT_MESSAGES } from '../../../domain/patients/DietCalculator';
import { speciesRequiresBreed } from '../../../domain/patients/speciesCatalog';
import { canonicalMealTime } from '../../../shared/mealTime';
import { canonicalAppointmentStatus } from '../../../domain/scheduling/appointmentNotes';
import { validatePhotoValue, PHOTO_EXTERNAL_URL_MESSAGE, isExternalHttpPhoto } from '../../../domain/shared/imageValidation';
import {
  LIMIT,
  emailField,
  lengthMessage,
  opt,
  optNull,
  optionalEmail,
  passwordField,
  refinePayloadStrings,
  txt,
} from './textLimits';

export { clinicMessageSchema, parseOptionalSearch } from './textLimits';

function refinePhotoField(photo: unknown, ctx: z.RefinementCtx, path: (string | number)[] = ['photo']): void {
  const result = validatePhotoValue(photo);
  if (result.ok) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message: result.message,
  });
}

function refineCreatePhotoFields(
  data: { photo?: unknown; photoUrl?: unknown },
  ctx: z.RefinementCtx,
): void {
  refinePhotoField(data.photo, ctx);
  const photoUrl = data.photoUrl;
  if (photoUrl === undefined || photoUrl === null || photoUrl === '') return;
  if (isExternalHttpPhoto(photoUrl) || (typeof photoUrl === 'string' && /^https?:\/\//i.test(photoUrl.trim()))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['photoUrl'],
      message: PHOTO_EXTERNAL_URL_MESSAGE,
    });
  }
}

export const registerSchema = z
  .object({
    email: emailField().optional(),
    phone: z.string().min(5).max(LIMIT.phone, lengthMessage('teléfono', LIMIT.phone)).optional(),
    password: passwordField(6),
    name: txt(LIMIT.personName, 'nombre').min(1),
    role: z.enum(['vet', 'owner']).optional(),
    clinic: opt(LIMIT.clinicName, 'clínica'),
    address: opt(LIMIT.address, 'dirección'),
    license: opt(LIMIT.license, 'licencia'),
    photo: z.string().optional(),
    photoUrl: z.string().optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'Email or phone is required',
  })
  .superRefine((data, ctx) => {
    refineCreatePhotoFields(data, ctx);
  });

export const loginSchema = z
  .object({
    email: emailField().optional(),
    phone: z.string().min(5).max(LIMIT.phone, lengthMessage('teléfono', LIMIT.phone)).optional(),
    password: passwordField(1),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'Email or phone is required',
  });

export const updateProfileSchema = z.object({
  name: txt(LIMIT.personName, 'nombre').min(1).optional(),
  email: emailField().optional(),
  phone: opt(LIMIT.phone, 'teléfono'),
  clinic: opt(LIMIT.clinicName, 'clínica'),
  address: opt(LIMIT.address, 'dirección'),
  license: opt(LIMIT.license, 'licencia'),
  photo: z.string().optional(),
  photoUrl: z.string().optional(),
  password: passwordField(6).optional(),
  currentPassword: passwordField(1, 'contraseña actual').optional(),
});

const feedingMealTimeSchema = z
  .string()
  .trim()
  .min(1, 'Hora de comida no reconocida')
  .max(LIMIT.dateTime, lengthMessage('hora', LIMIT.dateTime))
  .transform((value, ctx) => {
    const canon = canonicalMealTime(value);
    if (!canon) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Hora de comida no reconocida' });
      return z.NEVER;
    }
    return canon;
  });

const feedingMealSchema = z.object({
  id: txt(LIMIT.identifier, 'identificador').min(1).optional(),
  label: txt(LIMIT.itemName, 'comida').min(1),
  time: feedingMealTimeSchema,
  amount: optNull(LIMIT.dose, 'cantidad'),
  food: optNull(LIMIT.itemName, 'alimento'),
  notes: optNull(LIMIT.notes, 'notas'),
  sortOrder: z.number().int().optional(),
});

export const consultationTypeSchema = z.enum([
  'GENERAL',
  'PREVENTIVA',
  'VACUNACION',
  'DESPARASITACION',
  'ENFERMEDAD',
  'TRAUMATOLOGIA',
  'REPRODUCTIVA',
  'SEGUIMIENTO',
]);

const patientCreateObject = z.object({
  name: txt(LIMIT.petName, 'nombre de la mascota').min(1),
  species: txt(LIMIT.trait, 'especie').min(1),
  breed: opt(LIMIT.trait, 'raza'),
  age: txt(LIMIT.trait, 'edad').min(1),
  sex: txt(LIMIT.trait, 'sexo').min(1),
  weight: opt(LIMIT.dose, 'peso'),
  color: opt(LIMIT.trait, 'color'),
  microchip: opt(LIMIT.license, 'microchip'),
  ownerName: txt(LIMIT.personName, 'nombre del propietario').min(1),
  ownerPhone: opt(LIMIT.phone, 'teléfono'),
  ownerEmail: optionalEmail('correo del propietario'),
  photo: z.string().optional(),
  photoUrl: z.string().optional(),
  feeding: z
    .object({
      recommendedAmount: txt(LIMIT.dose, 'cantidad').min(1),
      mealsPerDay: z.number().int().positive(),
      specialInstructions: opt(LIMIT.notes, 'indicaciones'),
      allowedFoods: opt(LIMIT.notes, 'alimentos permitidos'),
      forbiddenFoods: opt(LIMIT.notes, 'alimentos prohibidos'),
      vetRecommendations: opt(LIMIT.notes, 'recomendaciones'),
      meals: z.array(feedingMealSchema).optional(),
    })
    .optional(),
  firstConsultation: z
    .object({
      type: consultationTypeSchema.optional(),
      reason: txt(LIMIT.appointmentReason, 'motivo').min(1),
      diagnosis: opt(LIMIT.notes, 'diagnóstico'),
      treatment: opt(LIMIT.notes, 'tratamiento'),
      weightAtVisit: opt(LIMIT.dose, 'peso'),
      temperature: opt(LIMIT.dose, 'temperatura'),
      observations: opt(LIMIT.notes, 'observaciones'),
      medication: opt(LIMIT.itemName, 'medicamento'),
      typePayload: z.record(z.unknown()).optional(),
      followUpDate: opt(LIMIT.dateTime, 'fecha'),
      followUpTime: opt(LIMIT.dateTime, 'hora'),
    })
    .optional(),
});

const patientCoreSchema = patientCreateObject.omit({ feeding: true, firstConsultation: true });

export const createPatientSchema = patientCreateObject.superRefine((data, ctx) => {
  if (speciesRequiresBreed(data.species) && !String(data.breed ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['breed'],
      message: 'La raza es obligatoria para esta especie',
    });
  }
  refineCreatePhotoFields(data, ctx);
  refinePayloadStrings(data.firstConsultation?.typePayload, ctx, ['firstConsultation', 'typePayload']);
});

export const updatePatientSchema = patientCoreSchema.partial().superRefine((data, ctx) => {
  if (data.species && speciesRequiresBreed(data.species) && !String(data.breed ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['breed'],
      message: 'La raza es obligatoria para esta especie',
    });
  }
});

export const linkPatientSchema = z.object({
  code: txt(LIMIT.patientCode, 'código').min(1),
});

export const linkRequestSchema = z.object({
  code: txt(LIMIT.patientCode, 'código').min(1),
  requestedRole: z.enum(['OWNER', 'CO_OWNER', 'CAREGIVER']).optional(),
});

export const refreshSchema = z.object({
  refreshToken: txt(LIMIT.refreshToken, 'token de sesión').min(10),
});

export const logoutSchema = z.object({
  refreshToken: txt(LIMIT.refreshToken, 'token de sesión').min(10).optional(),
});

export const passwordResetRequestSchema = z.object({
  email: emailField(),
});

export const passwordResetConfirmSchema = z.object({
  token: txt(LIMIT.identifier, 'token').min(10),
  password: passwordField(6),
});

export const emailVerifyConfirmSchema = z.object({
  token: txt(LIMIT.identifier, 'token').min(10),
});

export const mediaUploadUrlSchema = z.object({
  patientId: txt(LIMIT.identifier, 'identificador').min(1).optional(),
  mimeType: txt(LIMIT.trait, 'tipo de archivo').min(3),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(['pet', 'clinical', 'user_avatar']).optional(),
});

export const mediaConfirmSchema = z.object({
  assetId: txt(LIMIT.identifier, 'identificador').min(1),
  setAsPatientPhoto: z.boolean().optional(),
  setAsUserPhoto: z.boolean().optional(),
});

const medicalRecordObject = z.object({
  date: txt(LIMIT.dateTime, 'fecha').min(1),
  time: opt(LIMIT.dateTime, 'hora'),
  reason: txt(LIMIT.appointmentReason, 'motivo').min(1),
  diagnosis: opt(LIMIT.notes, 'diagnóstico'),
  treatment: opt(LIMIT.notes, 'tratamiento'),
  vetName: txt(LIMIT.personName, 'nombre').min(1).optional(),
  ownerName: opt(LIMIT.personName, 'nombre del propietario'),
  responsibleName: opt(LIMIT.personName, 'nombre'),
  status: opt(LIMIT.trait, 'estado'),
  type: consultationTypeSchema.optional(),
  weightAtVisit: opt(LIMIT.dose, 'peso'),
  temperature: opt(LIMIT.dose, 'temperatura'),
  heartRate: opt(LIMIT.dose, 'frecuencia cardíaca'),
  respiratoryRate: opt(LIMIT.dose, 'frecuencia respiratoria'),
  physicalExam: opt(LIMIT.notes, 'exploración'),
  prescriptions: opt(LIMIT.notes, 'receta'),
  medication: opt(LIMIT.itemName, 'medicamento'),
  results: opt(LIMIT.notes, 'resultados'),
  observations: opt(LIMIT.notes, 'observaciones'),
  notes: opt(LIMIT.notes, 'notas'),
  privateNotes: opt(LIMIT.notes, 'notas privadas'),
  typePayload: z.record(z.unknown()).optional(),
  followUpDate: opt(LIMIT.dateTime, 'fecha'),
  followUpTime: opt(LIMIT.dateTime, 'hora'),
  relatedConsultationId: opt(LIMIT.identifier, 'identificador'),
});

function withPayloadLimit<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data, ctx) => {
    const payload = (data as { typePayload?: unknown }).typePayload;
    refinePayloadStrings(payload, ctx, ['typePayload']);
  });
}

export const medicalRecordSchema = withPayloadLimit(medicalRecordObject);

export const updateMedicalRecordSchema = withPayloadLimit(medicalRecordObject.partial());

export const scheduleMedicationSchema = z.object({
  firstDoseDate: txt(LIMIT.dateTime, 'fecha').min(1),
  firstDoseTime: txt(LIMIT.dateTime, 'hora').min(1),
  intervalHours: z.number().int().positive().max(24 * 366).optional(),
  durationDays: z.number().int().positive().max(366).optional(),
});

export const feedingSchema = z.object({
  recommendedAmount: txt(LIMIT.dose, 'cantidad').min(1),
  mealsPerDay: z
    .number()
    .int(DIET_LIMIT_MESSAGES.meals)
    .min(DIET_LIMITS.mealsPerDayMin, DIET_LIMIT_MESSAGES.meals)
    .max(DIET_LIMITS.mealsPerDayMax, DIET_LIMIT_MESSAGES.meals),
  specialInstructions: opt(LIMIT.notes, 'indicaciones'),
  schedule: opt(LIMIT.notes, 'horario de alimentación'),
  weightKg: z
    .number()
    .min(DIET_LIMITS.weightKgMin, DIET_LIMIT_MESSAGES.weight)
    .max(DIET_LIMITS.weightKgMax, DIET_LIMIT_MESSAGES.weight)
    .optional(),
  caloriesPerDay: z.number().int().positive().optional(),
  formulaVersion: opt(LIMIT.trait, 'versión'),
  vetNotes: opt(LIMIT.notes, 'notas'),
  foodType: opt(LIMIT.itemName, 'alimento'),
  brand: opt(LIMIT.itemName, 'marca'),
  quantity: opt(LIMIT.dose, 'cantidad'),
  frequency: opt(LIMIT.dose, 'frecuencia'),
  restrictions: opt(LIMIT.notes, 'restricciones'),
  allergies: opt(LIMIT.notes, 'alergias'),
  observations: opt(LIMIT.notes, 'observaciones'),
  vetRecommendations: opt(LIMIT.notes, 'recomendaciones'),
  allowedFoods: opt(LIMIT.notes, 'alimentos permitidos'),
  forbiddenFoods: opt(LIMIT.notes, 'alimentos prohibidos'),
  objective: optNull(LIMIT.appointmentReason, 'objetivo'),
  targetWeightKg: z.number().positive().optional().nullable(),
  startDate: optNull(LIMIT.dateTime, 'fecha'),
  reviewDate: optNull(LIMIT.dateTime, 'fecha'),
  status: z.enum(['ACTIVE', 'PAUSED', 'FINISHED']).optional(),
  meals: z.array(feedingMealSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.meals && data.meals.length !== data.mealsPerDay) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mealsPerDay'],
      message: DIET_LIMIT_MESSAGES.mealsMismatch,
    });
  }
});

export const feedingLogSchema = z.object({
  mealId: txt(LIMIT.identifier, 'identificador').min(1),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD'),
  status: z.enum(['EATEN', 'PENDING', 'UNLOGGED', 'PARTIAL']),
  reason: z.enum(['NORMAL', 'LESS', 'REFUSED', 'SKIPPED', 'OTHER']).optional().nullable(),
  notes: optNull(LIMIT.notes, 'notas'),
});

export const favoriteSchema = z.object({
  targetType: z.enum(['REMINDER', 'APPOINTMENT']),
  targetId: txt(LIMIT.identifier, 'identificador').min(1),
});

export const dietSchema = z.object({
  weightKg: z
    .number()
    .min(DIET_LIMITS.weightKgMin, DIET_LIMIT_MESSAGES.weight)
    .max(DIET_LIMITS.weightKgMax, DIET_LIMIT_MESSAGES.weight),
  mealsPerDay: z
    .number()
    .int(DIET_LIMIT_MESSAGES.meals)
    .min(DIET_LIMITS.mealsPerDayMin, DIET_LIMIT_MESSAGES.meals)
    .max(DIET_LIMITS.mealsPerDayMax, DIET_LIMIT_MESSAGES.meals)
    .optional(),
  activityFactor: z
    .number()
    .min(DIET_LIMITS.activityFactorMin, DIET_LIMIT_MESSAGES.activity)
    .max(DIET_LIMITS.activityFactorMax, DIET_LIMIT_MESSAGES.activity)
    .optional(),
  vetNotes: opt(LIMIT.notes, 'notas'),
  species: opt(LIMIT.trait, 'especie'),
  objective: opt(LIMIT.appointmentReason, 'objetivo'),
  targetWeightKg: z.number().positive().optional(),
  startDate: opt(LIMIT.dateTime, 'fecha'),
  reviewDate: opt(LIMIT.dateTime, 'fecha'),
});

export const reminderSchema = z.object({
  title: txt(LIMIT.subject, 'título').min(1),
  description: opt(LIMIT.notes, 'descripción'),
  date: txt(LIMIT.dateTime, 'fecha').min(1),
  time: opt(LIMIT.dateTime, 'hora'),
  type: z.enum(['recordatorio', 'cita']).optional(),
  category: opt(LIMIT.itemName, 'categoría'),
  priority: z.enum(['baja', 'media', 'alta']).optional(),
  color: opt(LIMIT.trait, 'color'),
  icon: opt(LIMIT.trait, 'icono'),
  notifyEnabled: z.boolean().optional(),
  notes: opt(LIMIT.notes, 'notas'),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
});

export const updateReminderSchema = reminderSchema.partial().extend({
  completed: z.boolean().optional(),
});

const appointmentWhen = {
  date: txt(LIMIT.dateTime, 'fecha').min(1),
  time: txt(LIMIT.dateTime, 'hora').min(1),
};

export const createAppointmentSchema = z.object({
  petName: txt(LIMIT.petName, 'nombre de la mascota').min(1),
  ownerName: txt(LIMIT.personName, 'nombre del propietario').min(1),
  ...appointmentWhen,
  notes: opt(LIMIT.appointmentReason, 'motivo'),
  patientId: txt(LIMIT.identifier, 'identificador').min(1).optional(),
});

export const requestAppointmentSchema = z.object({
  patientId: txt(LIMIT.identifier, 'identificador').min(1),
  ...appointmentWhen,
  notes: opt(LIMIT.appointmentReason, 'motivo'),
});

export const acceptAppointmentSchema = z.object({
  date: txt(LIMIT.dateTime, 'fecha').min(1).optional(),
  time: txt(LIMIT.dateTime, 'hora').min(1).optional(),
  notes: opt(LIMIT.appointmentReason, 'motivo'),
});

export const postponeAppointmentSchema = z.object({
  ...appointmentWhen,
  notes: opt(LIMIT.appointmentReason, 'motivo'),
});

export const suggestAppointmentSchema = z.object({
  ...appointmentWhen,
  notes: opt(LIMIT.appointmentReason, 'motivo'),
});

export const rejectAppointmentSchema = z.object({
  notes: opt(LIMIT.appointmentReason, 'motivo'),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z
    .string()
    .max(LIMIT.trait, lengthMessage('estado', LIMIT.trait))
    .transform((value, ctx) => {
      const canonical = canonicalAppointmentStatus(value);
      if (!canonical) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Estado de cita no válido',
        });
        return z.NEVER;
      }
      return canonical;
    })
    .optional(),
  patientId: txt(LIMIT.identifier, 'identificador').min(1).nullable().optional(),
});

export const updateConfigSchema = z.object({
  clinicName: opt(LIMIT.clinicName, 'nombre de la clínica'),
  clinicAddress: opt(LIMIT.address, 'dirección'),
  clinicPhone: opt(LIMIT.phone, 'teléfono'),
  clinicEmail: opt(LIMIT.email, 'correo'),
  clinicHours: opt(LIMIT.address, 'horario'),
  mapUrl: opt(LIMIT.mapUrl, 'enlace del mapa'),
  language: opt(LIMIT.trait, 'idioma'),
  timezone: opt(LIMIT.trait, 'zona horaria'),
  dateFormat: opt(LIMIT.trait, 'formato de fecha'),
  theme: opt(LIMIT.trait, 'tema'),
  notifications: z.boolean().optional(),
  sounds: z.boolean().optional(),
});

export const barcodeEmailSchema = z.object({
  imageBase64: z.string().min(32).max(1_500_000),
});
