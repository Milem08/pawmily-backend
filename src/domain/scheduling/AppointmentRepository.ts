import { Appointment } from './Appointment';

export interface CreateAppointmentData {
  petName: string;
  ownerName: string;
  date: string;
  time: string;
  notes?: string | null;
  vetId: string;
  status?: string;
  patientId?: string | null;
  attendanceStatus?: string;
}

export interface UpdateAppointmentData {
  petName?: string;
  ownerName?: string;
  date?: string;
  time?: string;
  notes?: string | null;
  status?: string;
  patientId?: string | null;
  attendanceStatus?: string;
  ownerConfirmedAt?: Date | null;
}

export interface AppointmentListResult {
  items: Appointment[];
  total: number;
}

export interface AppointmentRepository {
  create(data: CreateAppointmentData): Promise<Appointment>;
  findById(id: string): Promise<Appointment | null>;
  findByVet(
    vetId: string,
    options: { date?: string; page: number; limit: number },
  ): Promise<AppointmentListResult>;
  findByPatientIds(
    patientIds: string[],
    options: { page: number; limit: number },
  ): Promise<AppointmentListResult>;
  findByMonth(vetId: string, year: number, month: number): Promise<Appointment[]>;
  update(id: string, data: UpdateAppointmentData): Promise<Appointment>;
  delete(id: string): Promise<void>;
}
