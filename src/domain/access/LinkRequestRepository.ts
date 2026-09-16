import { PatientAccessRole } from './PatientAccessRole';

export type LinkRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LinkRequestRecord {
  id: string;
  requesterId: string;
  patientId: string;
  requestedRole: PatientAccessRole;
  status: LinkRequestStatus;
  decidedBy?: string | null;
  decidedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requesterName?: string;
  requesterEmail?: string;
  patientName?: string;
  patientCode?: string;
}

export interface LinkRequestRepository {
  create(data: {
    requesterId: string;
    patientId: string;
    requestedRole: PatientAccessRole;
  }): Promise<LinkRequestRecord>;
  findById(id: string): Promise<LinkRequestRecord | null>;
  findPending(requesterId: string, patientId: string): Promise<LinkRequestRecord | null>;
  listPendingForPatient(patientId: string): Promise<LinkRequestRecord[]>;
  listPendingForVet(vetId: string): Promise<LinkRequestRecord[]>;
  listPendingForOwner(ownerUserId: string): Promise<LinkRequestRecord[]>;
  /** Update only if still PENDING; returns null when already decided (CAS). */
  decidePending(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    decidedBy: string,
  ): Promise<LinkRequestRecord | null>;
  /**
   * Atomically: upsert PatientAccess + optional claim OWNER + mark request APPROVED.
   * Fails if request is no longer PENDING.
   */
  approveWithGrant(data: {
    requestId: string;
    decidedBy: string;
    userId: string;
    patientId: string;
    role: PatientAccessRole;
    claimOwner?: {
      ownerName: string;
      ownerPhone?: string | null;
      ownerEmail?: string | null;
    } | null;
  }): Promise<LinkRequestRecord>;
}
