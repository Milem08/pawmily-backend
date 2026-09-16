import {
  FeedingProps,
  MedicalRecordProps,
  Patient,
  PatientProps,
  ReminderProps,
} from './Patient';

export type CreatePatientData = Omit<
  PatientProps,
  | 'id'
  | 'code'
  | 'barcodePayload'
  | 'createdAt'
  | 'updatedAt'
  | 'medicalRecords'
  | 'feeding'
  | 'reminders'
> & { code?: string; barcodePayload?: string };

export type UpdatePatientData = Partial<
  Omit<
    PatientProps,
    | 'id'
    | 'code'
    | 'barcodePayload'
    | 'vetId'
    | 'createdAt'
    | 'updatedAt'
    | 'medicalRecords'
    | 'feeding'
    | 'reminders'
  >
>;

export interface CreateMedicalRecordData {
  date: string;
  time?: string | null;
  reason: string;
  diagnosis?: string | null;
  treatment?: string | null;
  vetName: string;
  ownerName?: string | null;
  responsibleName?: string | null;
  status?: string;
  type?: string;
  weightAtVisit?: string | null;
  temperature?: string | null;
  heartRate?: string | null;
  respiratoryRate?: string | null;
  physicalExam?: string | null;
  prescriptions?: string | null;
  medication?: string | null;
  results?: string | null;
  observations?: string | null;
  notes?: string | null;
  privateNotes?: string | null;
  typePayload?: unknown;
  followUpDate?: string | null;
  followUpTime?: string | null;
  relatedConsultationId?: string | null;
  followUpAppointmentId?: string | null;
}

export type UpdateMedicalRecordData = Partial<CreateMedicalRecordData>;

export interface FeedingMealInput {
  label: string;
  time: string;
  amount?: string | null;
  food?: string | null;
  notes?: string | null;
  sortOrder?: number;
}

export interface UpsertFeedingData {
  recommendedAmount: string;
  mealsPerDay: number;
  specialInstructions?: string | null;
  schedule?: string | null;
  weightKg?: number | null;
  caloriesPerDay?: number | null;
  formulaVersion?: string | null;
  vetNotes?: string | null;
  foodType?: string | null;
  brand?: string | null;
  quantity?: string | null;
  frequency?: string | null;
  restrictions?: string | null;
  allergies?: string | null;
  observations?: string | null;
  vetRecommendations?: string | null;
  allowedFoods?: string | null;
  forbiddenFoods?: string | null;
  objective?: string | null;
  targetWeightKg?: number | null;
  startDate?: string | null;
  reviewDate?: string | null;
  status?: string | null;
  meals?: FeedingMealInput[];
}

export interface CreateReminderData {
  title: string;
  description?: string | null;
  date: string;
  time?: string | null;
  type?: string;
  category?: string | null;
  priority?: string | null;
  color?: string | null;
  icon?: string | null;
  notifyEnabled?: boolean;
  notes?: string | null;
  recurrence?: string | null;
  createdByUserId?: string | null;
  notificationMessage?: string | null;
  appointmentId?: string | null;
  feedingMealId?: string | null;
}

export type UpdateReminderData = Partial<
  Omit<CreateReminderData, 'createdByUserId' | 'appointmentId'> & {
    completed?: boolean;
    completedAt?: Date | null;
  }
>;

export interface PatientListResult {
  items: Patient[];
  total: number;
}

export interface PatientRepository {
  count(): Promise<number>;
  /** Highest numeric suffix among PAW-###### codes (0 if none). */
  maxCodeSequence(): Promise<number>;
  codeExists(code: string): Promise<boolean>;
  migrateCode(id: string, newCode: string): Promise<Patient>;
  create(data: CreatePatientData & { code: string; barcodePayload: string }): Promise<Patient>;
  findById(id: string): Promise<Patient | null>;
  findByCode(code: string): Promise<Patient | null>;
  findManyByIds(ids: string[]): Promise<Patient[]>;
  findByVet(
    vetId: string,
    options: { search?: string; page: number; limit: number },
  ): Promise<PatientListResult>;
  findByOwner(
    ownerUserId: string,
    options: { page: number; limit: number },
  ): Promise<PatientListResult>;
  update(id: string, data: UpdatePatientData): Promise<Patient>;
  setOwnerUserId(id: string, ownerUserId: string | null): Promise<Patient>;
  /** First owner claim: links user and syncs primary owner contact fields. */
  claimPrimaryOwner(
    id: string,
    data: {
      ownerUserId: string;
      ownerName: string;
      ownerPhone?: string | null;
      ownerEmail?: string | null;
    },
  ): Promise<Patient>;
  delete(id: string): Promise<void>;
  addMedicalRecord(petId: string, data: CreateMedicalRecordData): Promise<MedicalRecordProps>;
  updateMedicalRecord(
    recordId: string,
    data: UpdateMedicalRecordData,
  ): Promise<MedicalRecordProps>;
  deleteMedicalRecord(recordId: string): Promise<void>;
  findMedicalRecordById(recordId: string): Promise<MedicalRecordProps | null>;
  listMedicalRecords(petId: string): Promise<MedicalRecordProps[]>;
  upsertFeeding(petId: string, data: UpsertFeedingData): Promise<FeedingProps>;
  getFeeding(petId: string): Promise<FeedingProps | null>;
  addReminder(petId: string, data: CreateReminderData): Promise<ReminderProps>;
  updateReminder(id: string, data: UpdateReminderData): Promise<ReminderProps>;
  listReminders(petId: string): Promise<ReminderProps[]>;
  deleteReminder(id: string): Promise<void>;
  findReminderById(id: string): Promise<ReminderProps | null>;
}
