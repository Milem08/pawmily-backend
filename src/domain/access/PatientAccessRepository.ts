import { PatientAccessRole } from './PatientAccessRole';

export interface PatientAccessGrant {
  id: string;
  userId: string;
  patientId: string;
  role: PatientAccessRole;
  status: string;
  grantedBy?: string | null;
  createdAt: Date;
  revokedAt?: Date | null;
  userName?: string;
  userEmail?: string;
}

export interface PatientAccessRepository {
  findActive(userId: string, patientId: string): Promise<PatientAccessGrant | null>;
  listActiveForPatient(patientId: string): Promise<PatientAccessGrant[]>;
  listActivePatientIdsForUser(userId: string): Promise<string[]>;
  upsertActive(data: {
    userId: string;
    patientId: string;
    role: PatientAccessRole;
    grantedBy?: string | null;
  }): Promise<PatientAccessGrant>;
  revoke(userId: string, patientId: string): Promise<void>;
  findActiveOwner(patientId: string): Promise<PatientAccessGrant | null>;
}
