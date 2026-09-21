import { z } from 'zod';

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
});

const feedingMealSchema = z.object({
  label: z.string().min(1),
  time: z.string().min(1),
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

export const createPatientSchema = z.object({
  name: z.string().min(1),
  species: z.string().min(1),
  breed: z.string().min(1),
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

export const updatePatientSchema = createPatientSchema
  .omit({ feeding: true, firstConsultation: true })
  .partial();

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
  intervalHours: z.number().int().positive().max(48).optional(),
  durationDays: z.number().int().positive().max(30).optional(),
});

export const feedingSchema = z.object({
  recommendedAmount: z.string().min(1),
  mealsPerDay: z.number().int().positive(),
  specialInstructions: z.string().optional(),
  schedule: z.string().optional(),
  weightKg: z.number().positive().optional(),
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
});

export const feedingLogSchema = z.object({
  mealId: z.string().min(1),
  scheduledDate: z.string().min(1),
  status: z.enum(['EATEN', 'PENDING', 'UNLOGGED', 'PARTIAL']),
  reason: z.enum(['NORMAL', 'LESS', 'REFUSED', 'SKIPPED', 'OTHER']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const favoriteSchema = z.object({
  targetType: z.enum(['REMINDER', 'APPOINTMENT']),
  targetId: z.string().min(1),
});

export const dietSchema = z.object({
  weightKg: z.number().positive(),
  mealsPerDay: z.number().int().positive().optional(),
  activityFactor: z.number().positive().optional(),
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

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.string().optional(),
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
