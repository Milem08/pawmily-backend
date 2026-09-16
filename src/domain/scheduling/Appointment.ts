export interface AppointmentProps {
  id: string;
  petName: string;
  ownerName: string;
  date: string;
  time: string;
  notes?: string | null;
  status: string;
  attendanceStatus?: string;
  ownerConfirmedAt?: Date | null;
  vetId: string;
  patientId?: string | null;
  createdAt?: Date;
}

export class Appointment {
  constructor(public readonly props: AppointmentProps) {}

  get id() {
    return this.props.id;
  }

  get vetId() {
    return this.props.vetId;
  }

  get patientId() {
    return this.props.patientId ?? null;
  }

  belongsToVet(vetId: string): boolean {
    return this.props.vetId === vetId;
  }
}
