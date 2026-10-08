import { z } from 'zod';
import { DIET_LIMITS, DIET_LIMIT_MESSAGES } from '../../../domain/patients/DietCalculator';
import { speciesRequiresBreed } from '../../../domain/patients/speciesCatalog';
import { canonicalMealTime } from '../../../shared/mealTime';
import { canonicalAppointmentStatus } from '../../../domain/scheduling/appointmentNotes';

export const registerSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(5).optional(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.enum(['vet', 'owner']).optional(),
    clinic: z.string().optional(),
    address: z.string().optional(),
    license: z.string().optional(),
    photo: z.string().optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'Email or phone is required',
  });

export const loginSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(5).optional(),
    password: z.string().min(1),
  })
  .refine((d) => Boolean(d.email || d.phone), {
    message: 'Email or phone is required',
  });

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  clinic: z.string().optional(),
  address: z.string().optional(),
  license: z.string().optional(),
  photo: z.string().optional(),
  password: z.string().min(6).optional(),
  currentPassword: z.string().min(1).optional(),
});

const feedingMealTimeSchema = z
  .string()
  .trim()
  .min(1, 'Hora de comida no reconocida')
  .transform((value, ctx) => {
    const canon = canonicalMealTime(value);
    if (!canon) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Hora de comida no reconocida' });
      return z.NEVER;
    }
    return canon;
  });

const feedingMealSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  time: feedingMealTimeSchema,
  amount: z.string().optional().nullable(),
  food: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
  name: z.string().min(1),
  species: z.string().min(1),
  breed: z.string().optional(),
  age: z.string().min(1),
  sex: z.string().min(1),
  weight: z.string().optional(),
  color: z.string().optional(),
  microchip: z.string().optional(),
  ownerName: z.string().min(1),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().email().optional().or(z.literal('')),
  photo: z.string().optional(),
  feeding: z
    .object({
      recommendedAmount: z.string().min(1),
      mealsPerDay: z.number().int().positive(),
      specialInstructions: z.string().optional(),
      allowedFoods: z.string().optional(),
      forbiddenFoods: z.string().optional(),
      vetRecommendations: z.string().optional(),
      meals: z.array(feedingMealSchema).optional(),
    })
    .optional(),
  firstConsultation: z
    .object({
      type: consultationTypeSchema.optional(),
      reason: z.string().min(1),
      diagnosis: z.string().optional(),
      treatment: z.string().optional(),
      weightAtVisit: z.string().optional(),
      temperature: z.string().optional(),
      observations: z.string().optional(),
      medication: z.string().optional(),
      typePayload: z.record(z.unknown()).optional(),
      followUpDate: z.string().optional(),
      followUpTime: z.string().optional(),
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
  code: z.string().min(1),
});

export const linkRequestSchema = z.object({
  code: z.string().min(1),
  requestedRole: z.enum(['OWNER', 'CO_OWNER', 'CAREGIVER']).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6),
});

export const emailVerifyConfirmSchema = z.object({
  token: z.string().min(10),
});

export const mediaUploadUrlSchema = z.object({
  patientId: z.string().min(1).optional(),
  mimeType: z.string().min(3),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(['pet', 'clinical', 'user_avatar']).optional(),
});

export const mediaConfirmSchema = z.object({
  assetId: z.string().min(1),
  setAsPatientPhoto: z.boolean().optional(),
  setAsUserPhoto: z.boolean().optional(),
});

export const medicalRecordSchema = z.object({
  date: z.string().min(1),
  time: z.string().optional(),
  reason: z.string().min(1),
  diagnosis: z.string().optional(),
  treatment: z.string().optional(),
  vetName: z.string().min(1).optional(),
  ownerName: z.string().optional(),
  responsibleName: z.string().optional(),
  status: z.string().optional(),
  type: consultationTypeSchema.optional(),
  weightAtVisit: z.string().optional(),
  temperature: z.string().optional(),
  heartRate: z.string().optional(),
  respiratoryRate: z.string().optional(),
  physicalExam: z.string().optional(),
  prescriptions: z.string().optional(),
  medication: z.string().optional(),
  results: z.string().optional(),
  observations: z.string().optional(),
  notes: z.string().optional(),
  privateNotes: z.string().optional(),
  typePayload: z.record(z.unknown()).optional(),
  followUpDate: z.string().optional(),
  followUpTime: z.string().optional(),
  relatedConsultationId: z.string().optional(),
});

export const updateMedicalRecordSchema = medicalRecordSchema.partial();

export const scheduleMedicationSchema = z.object({
  firstDoseDate: z.string().min(1),
  firstDoseTime: z.string().min(1),
  intervalHours: z.number().int().positive().max(24 * 366).optional(),
  durationDays: z.number().int().positive().max(366).optional(),
});

export const feedingSchema = z.object({
  recommendedAmount: z.string().min(1),
  mealsPerDay: z
    .number()
    .int(DIET_LIMIT_MESSAGES.meals)
    .min(DIET_LIMITS.mealsPerDayMin, DIET_LIMIT_MESSAGES.meals)
    .max(DIET_LIMITS.mealsPerDayMax, DIET_LIMIT_MESSAGES.meals),
  specialInstructions: z.string().optional(),
  schedule: z.string().optional(),
  weightKg: z
    .number()
    .min(DIET_LIMITS.weightKgMin, DIET_LIMIT_MESSAGES.weight)
    .max(DIET_LIMITS.weightKgMax, DIET_LIMIT_MESSAGES.weight)
    .optional(),
  caloriesPerDay: z.number().int().positive().optional(),
  formulaVersion: z.string().optional(),
  vetNotes: z.string().optional(),
  foodType: z.string().optional(),
  brand: z.string().optional(),
  quantity: z.string().optional(),
  frequency: z.string().optional(),
  restrictions: z.string().optional(),
  allergies: z.string().optional(),
  observations: z.string().optional(),
  vetRecommendations: z.string().optional(),
  allowedFoods: z.string().optional(),
  forbiddenFoods: z.string().optional(),
  objective: z.string().optional().nullable(),
  targetWeightKg: z.number().positive().optional().nullable(),
  startDate: z.string().optional().nullable(),
  reviewDate: z.string().optional().nullable(),
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
  mealId: z.string().min(1),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener el formato AAAA-MM-DD'),
  status: z.enum(['EATEN', 'PENDING', 'UNLOGGED', 'PARTIAL']),
  reason: z.enum(['NORMAL', 'LESS', 'REFUSED', 'SKIPPED', 'OTHER']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const favoriteSchema = z.object({
  targetType: z.enum(['REMINDER', 'APPOINTMENT']),
  targetId: z.string().min(1),
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
  vetNotes: z.string().optional(),
  species: z.string().optional(),
  objective: z.string().optional(),
  targetWeightKg: z.number().positive().optional(),
  startDate: z.string().optional(),
  reviewDate: z.string().optional(),
});

export const reminderSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: z.string().min(1),
  time: z.string().optional(),
  type: z.enum(['recordatorio', 'cita']).optional(),
  category: z.string().optional(),
  priority: z.enum(['baja', 'media', 'alta']).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  notifyEnabled: z.boolean().optional(),
  notes: z.string().optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
});

export const updateReminderSchema = reminderSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const createAppointmentSchema = z.object({
  petName: z.string().min(1),
  ownerName: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  notes: z.string().optional(),
  patientId: z.string().min(1).optional(),
});

export const requestAppointmentSchema = z.object({
  patientId: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export const acceptAppointmentSchema = z.object({
  date: z.string().min(1).optional(),
  time: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

export const postponeAppointmentSchema = z.object({
  date: z.string().min(1),
  time: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export const suggestAppointmentSchema = z.object({
  date: z.string().min(1),
  time: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export const rejectAppointmentSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z
    .string()
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
  patientId: z.string().min(1).nullable().optional(),
});

export const updateConfigSchema = z.object({
  clinicName: z.string().optional(),
  clinicAddress: z.string().optional(),
  clinicPhone: z.string().optional(),
  clinicEmail: z.string().optional(),
  clinicHours: z.string().optional(),
  mapUrl: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  theme: z.string().optional(),
  notifications: z.boolean().optional(),
  sounds: z.boolean().optional(),
});

export const barcodeEmailSchema = z.object({
  imageBase64: z.string().min(32).max(1_500_000),
});
