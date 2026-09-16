import { generateSecurePatientCode } from './PatientCode';

/** @deprecated Prefer generateSecurePatientCode — kept for tests/legacy parsing. */
export function formatPatientCode(sequence: number): string {
  if (sequence < 1) {
    throw new Error('Patient sequence must be >= 1');
  }
  return `PAW-${String(sequence).padStart(6, '0')}`;
}

export { generateSecurePatientCode };

export interface PatientProps {
  id: string;
  code: string;
  previousCode?: string | null;
  barcodePayload: string;
  name: string;
  species: string;
  breed: string;
  age: string;
  sex: string;
  weight?: string | null;
  color?: string | null;
  microchip?: string;
  ownerName: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  photo?: string | null;
  photoAssetId?: string | null;
  vetId: string;
  ownerUserId?: string | null;
  accessRole?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  medicalRecords?: MedicalRecordProps[];
  feeding?: FeedingProps | null;
  reminders?: ReminderProps[];
}

export interface MedicalRecordProps {
  id: string;
  consultationNumber: string;
  type: string;
  date: string;
  time?: string | null;
  reason: string;
  diagnosis?: string | null;
  treatment?: string | null;
  vetName: string;
  ownerName?: string | null;
  responsibleName?: string | null;
  status: string;
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
  petId: string;
  createdAt?: Date;
}

export interface FeedingMealProps {
  id: string;
  feedingId: string;
  label: string;
  time: string;
  amount?: string | null;
  food?: string | null;
  notes?: string | null;
  sortOrder: number;
}

export interface FeedingProps {
  id: string;
  petId: string;
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
  meals?: FeedingMealProps[];
}

export interface ReminderProps {
  id: string;
  title: string;
  description?: string | null;
  date: string;
  time?: string | null;
  type: string;
  category?: string | null;
  priority?: string | null;
  color?: string | null;
  icon?: string | null;
  notifyEnabled?: boolean;
  notes?: string | null;
  recurrence?: string | null;
  completed?: boolean;
  completedAt?: Date | null;
  createdByUserId?: string | null;
  notificationMessage?: string | null;
  petId: string;
  appointmentId?: string | null;
  createdAt?: Date;
}

export class Patient {
  constructor(public readonly props: PatientProps) {}

  get id() {
    return this.props.id;
  }

  get vetId() {
    return this.props.vetId;
  }

  get code() {
    return this.props.code;
  }

  get ownerUserId() {
    return this.props.ownerUserId ?? null;
  }

  belongsToVet(vetId: string): boolean {
    return this.props.vetId === vetId;
  }

  belongsToOwner(ownerUserId: string): boolean {
    return this.props.ownerUserId === ownerUserId;
  }

  canRead(actor: { id: string; role: string }): boolean {
    if (actor.role === 'vet') {
      return this.belongsToVet(actor.id);
    }
    if (actor.role === 'owner') {
      return this.belongsToOwner(actor.id);
    }
    return false;
  }
}
