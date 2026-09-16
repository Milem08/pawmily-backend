import { DomainError } from '../../domain/shared/DomainError';
import {
  canAccessRolePerform,
  PatientAccessRole,
  PatientAction,
} from '../../domain/access/PatientAccessRole';
import { Role } from '../../domain/identity/Role';
import { Patient } from '../../domain/patients/Patient';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import { PatientRepository } from '../../domain/patients/PatientRepository';

export interface AuthActor {
  id: string;
  role: Role;
}

export interface AccessContext {
  patient: Patient;
  petRole: PatientAccessRole | 'VET' | null;
}

/**
 * Dual-read: PatientAccess ACTIVE wins; else legacy ownerUserId → OWNER; vet via vetId → VET.
 */
export async function resolvePatientAccess(
  patients: PatientRepository,
  accesses: PatientAccessRepository,
  actor: AuthActor,
  patientId: string,
): Promise<AccessContext> {
  const patient = await patients.findById(patientId);
  if (!patient) {
    throw new DomainError('Paciente no encontrado', 404);
  }

  if (actor.role === 'vet' && patient.belongsToVet(actor.id)) {
    return { patient, petRole: 'VET' };
  }

  const grant = await accesses.findActive(actor.id, patientId);
  if (grant) {
    return { patient, petRole: grant.role };
  }

  // Legacy dual-read
  if (actor.role === 'owner' && patient.belongsToOwner(actor.id)) {
    return { patient, petRole: 'OWNER' };
  }

  return { patient, petRole: null };
}

export async function authorizePatientAction(
  patients: PatientRepository,
  accesses: PatientAccessRepository,
  actor: AuthActor,
  patientId: string,
  action: PatientAction,
): Promise<AccessContext> {
  const ctx = await resolvePatientAccess(patients, accesses, actor, patientId);
  if (!ctx.petRole || !canAccessRolePerform(ctx.petRole, action)) {
    throw new DomainError('No autorizado', 403);
  }
  return ctx;
}

export async function listAccessiblePatientIds(
  accesses: PatientAccessRepository,
  patients: PatientRepository,
  userId: string,
): Promise<string[]> {
  const fromAccess = await accesses.listActivePatientIdsForUser(userId);
  const legacy = await patients.findByOwner(userId, { page: 1, limit: 500 });
  const set = new Set<string>([...fromAccess, ...legacy.items.map((p) => p.id)]);
  return [...set];
}
