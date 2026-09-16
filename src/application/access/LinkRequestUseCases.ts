import { DomainError } from '../../domain/shared/DomainError';
import { isPatientAccessRole, PatientAccessRole } from '../../domain/access/PatientAccessRole';
import { LinkRequestRepository } from '../../domain/access/LinkRequestRepository';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { UserRepository } from '../../domain/identity/UserRepository';
import { AuthActor } from './authorizePatientAction';
import { AuditService } from '../../infrastructure/audit/AuditService';
import { normalizePatientCode } from '../../domain/patients/PatientCode';

async function hasOwner(
  patients: PatientRepository,
  accesses: PatientAccessRepository,
  patientId: string,
): Promise<boolean> {
  const grant = await accesses.findActiveOwner(patientId);
  if (grant) return true;
  const patient = await patients.findById(patientId);
  return Boolean(patient?.ownerUserId);
}

export class LookupPatientForLink {
  constructor(private readonly patients: PatientRepository) {}

  async execute(actor: AuthActor, code: string) {
    if (actor.role !== 'owner') {
      throw new DomainError('Solo dueños pueden solicitar vinculación', 403);
    }
    const patient = await this.patients.findByCode(normalizePatientCode(code));
    if (!patient) {
      throw new DomainError('Paciente no encontrado con ese código', 404);
    }
    // Public-minimal payload (no clinical PII)
    return {
      id: patient.id,
      name: patient.props.name,
      species: patient.props.species,
      code: patient.code,
      hasOwner: Boolean(patient.ownerUserId),
      clinicHint: null as string | null,
    };
  }
}

export class CreateLinkRequest {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly links: LinkRequestRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(
    actor: AuthActor,
    input: { code: string; requestedRole?: string },
    ip?: string,
  ) {
    if (actor.role !== 'owner') {
      throw new DomainError('Solo cuentas owner pueden solicitar vinculación', 403);
    }
    const code = normalizePatientCode(input.code);
    const patient = await this.patients.findByCode(code);
    if (!patient) {
      throw new DomainError('Paciente no encontrado con ese código', 404);
    }

    const existingAccess = await this.accesses.findActive(actor.id, patient.id);
    if (existingAccess || patient.belongsToOwner(actor.id)) {
      throw new DomainError('Ya tienes acceso a esta mascota', 409);
    }

    const pending = await this.links.findPending(actor.id, patient.id);
    if (pending) {
      return pending;
    }

    const ownerExists = await hasOwner(this.patients, this.accesses, patient.id);
    let requestedRole: PatientAccessRole;

    if (!ownerExists) {
      requestedRole = 'OWNER';
      if (input.requestedRole && input.requestedRole !== 'OWNER') {
        throw new DomainError('La mascota aún no tiene dueño; solicita rol OWNER', 400);
      }
    } else {
      const role = (input.requestedRole || 'CAREGIVER').toUpperCase();
      if (!isPatientAccessRole(role) || role === 'OWNER') {
        throw new DomainError('Rol solicitado inválido (usa CO_OWNER o CAREGIVER)', 400);
      }
      requestedRole = role;
    }

    const request = await this.links.create({
      requesterId: actor.id,
      patientId: patient.id,
      requestedRole,
    });

    await this.audit.log({
      actorId: actor.id,
      action: 'LINK_REQUEST',
      resourceType: 'LinkRequest',
      resourceId: request.id,
      patientId: patient.id,
      meta: { requestedRole },
      ip,
    });

    return request;
  }
}

export class ListPendingLinkRequests {
  constructor(
    private readonly links: LinkRequestRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor) {
    if (actor.role === 'vet') {
      return this.links.listPendingForVet(actor.id);
    }
    if (actor.role === 'owner') {
      return this.links.listPendingForOwner(actor.id);
    }
    return [];
  }
}

export class ApproveLinkRequest {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly links: LinkRequestRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(actor: AuthActor, requestId: string, ip?: string) {
    const request = await this.links.findById(requestId);
    if (!request) {
      throw new DomainError('Solicitud no encontrada', 404);
    }

    const patient = await this.patients.findById(request.patientId);
    if (!patient) {
      throw new DomainError('Paciente no encontrado', 404);
    }

    // Authz checks (even when healing a partial prior approve)
    if (request.requestedRole === 'OWNER') {
      if (actor.role !== 'vet' || !patient.belongsToVet(actor.id)) {
        throw new DomainError('Solo el veterinario de la clínica puede aprobar el primer dueño', 403);
      }
    } else {
      const grant = await this.accesses.findActive(actor.id, patient.id);
      const isOwner =
        (grant && grant.role === 'OWNER') ||
        (actor.role === 'owner' && patient.belongsToOwner(actor.id));
      if (!isOwner) {
        throw new DomainError('Solo el dueño puede aprobar co-dueños o cuidadores', 403);
      }
    }

    const requesterAccess = await this.accesses.findActive(request.requesterId, patient.id);
    const ownerGrant = await this.accesses.findActiveOwner(patient.id);
    const requesterIsOwner =
      requesterAccess?.role === 'OWNER' ||
      patient.ownerUserId === request.requesterId ||
      ownerGrant?.userId === request.requesterId;

    // Heal partial approve: access already granted, request still PENDING
    const alreadyGranted =
      (request.requestedRole === 'OWNER' && requesterIsOwner) ||
      (requesterAccess?.role === request.requestedRole);
    if (alreadyGranted) {
      if (request.status === 'PENDING') {
        const healed = await this.links.decidePending(requestId, 'APPROVED', actor.id);
        if (healed) {
          await this.audit.log({
            actorId: actor.id,
            action: 'LINK_APPROVE',
            resourceType: 'LinkRequest',
            resourceId: requestId,
            patientId: patient.id,
            meta: { role: request.requestedRole, requesterId: request.requesterId, healed: true },
            ip,
          });
          return healed;
        }
      }
      if (request.status === 'APPROVED') {
        return request;
      }
    }

    if (request.status !== 'PENDING') {
      throw new DomainError('Solicitud no encontrada', 404);
    }

    if (request.requestedRole === 'OWNER') {
      const ownerExists = await hasOwner(this.patients, this.accesses, patient.id);
      if (ownerExists && !requesterIsOwner) {
        throw new DomainError('La mascota ya tiene dueño', 409);
      }
    }

    const user = await this.users.findById(request.requesterId);
    if (!user) {
      throw new DomainError('Solicitante no encontrado', 404);
    }

    let decided;
    try {
      decided = await this.links.approveWithGrant({
        requestId,
        decidedBy: actor.id,
        userId: request.requesterId,
        patientId: patient.id,
        role: request.requestedRole,
        claimOwner:
          request.requestedRole === 'OWNER'
            ? {
                ownerName: user.props.name,
                ownerPhone: user.props.phone ?? null,
                ownerEmail: user.props.email ?? null,
              }
            : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'LINK_REQUEST_NOT_PENDING') {
        // Concurrent approve won the race — treat as success if now APPROVED
        const current = await this.links.findById(requestId);
        if (current?.status === 'APPROVED') return current;
        throw new DomainError('La solicitud ya fue procesada', 409);
      }
      throw err;
    }

    await this.audit.log({
      actorId: actor.id,
      action: 'LINK_APPROVE',
      resourceType: 'LinkRequest',
      resourceId: requestId,
      patientId: patient.id,
      meta: { role: request.requestedRole, requesterId: request.requesterId },
      ip,
    });
    return decided;
  }
}

export class RejectLinkRequest {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly links: LinkRequestRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(actor: AuthActor, requestId: string, ip?: string) {
    const request = await this.links.findById(requestId);
    if (!request || request.status !== 'PENDING') {
      throw new DomainError('Solicitud no encontrada', 404);
    }
    const patient = await this.patients.findById(request.patientId);
    if (!patient) {
      throw new DomainError('Paciente no encontrado', 404);
    }

    if (request.requestedRole === 'OWNER') {
      if (actor.role !== 'vet' || !patient.belongsToVet(actor.id)) {
        throw new DomainError('No autorizado', 403);
      }
    } else {
      const grant = await this.accesses.findActive(actor.id, patient.id);
      const isOwner =
        (grant && grant.role === 'OWNER') ||
        (actor.role === 'owner' && patient.belongsToOwner(actor.id));
      if (!isOwner) {
        throw new DomainError('No autorizado', 403);
      }
    }

    const decided = await this.links.decidePending(requestId, 'REJECTED', actor.id);
    if (!decided) {
      throw new DomainError('La solicitud ya fue procesada', 409);
    }
    await this.audit.log({
      actorId: actor.id,
      action: 'LINK_REJECT',
      resourceType: 'LinkRequest',
      resourceId: requestId,
      patientId: patient.id,
      ip,
    });
    return decided;
  }
}

export class ListPatientMembers {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
  ) {}

  async execute(actor: AuthActor, patientId: string) {
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new DomainError('Paciente no encontrado', 404);
    }

    const canSee =
      (actor.role === 'vet' && patient.belongsToVet(actor.id)) ||
      (await this.accesses.findActive(actor.id, patientId)) ||
      (actor.role === 'owner' && patient.belongsToOwner(actor.id));
    if (!canSee) {
      throw new DomainError('No autorizado', 403);
    }

    const members = await this.accesses.listActiveForPatient(patientId);
    if (members.length === 0 && patient.ownerUserId) {
      const legacy = await this.patients.findById(patientId);
      return [
        {
          userId: patient.ownerUserId,
          role: 'OWNER' as const,
          status: 'ACTIVE',
          legacy: true,
          userName: legacy?.props.ownerName,
          userEmail: legacy?.props.ownerEmail,
        },
      ];
    }
    return members;
  }
}

export class RevokePatientMember {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly audit: AuditService,
  ) {}

  async execute(actor: AuthActor, patientId: string, memberUserId: string, ip?: string) {
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new DomainError('Paciente no encontrado', 404);
    }
    const grant = await this.accesses.findActive(actor.id, patientId);
    const isOwner =
      (grant && grant.role === 'OWNER') ||
      (actor.role === 'owner' && patient.belongsToOwner(actor.id));
    if (!isOwner) {
      throw new DomainError('Solo el dueño puede revocar accesos', 403);
    }
    if (memberUserId === actor.id) {
      throw new DomainError('No puedes revocarte a ti mismo; usa desvincular', 400);
    }
    const target = await this.accesses.findActive(memberUserId, patientId);
    if (!target) {
      throw new DomainError('Miembro no encontrado', 404);
    }
    if (target.role === 'OWNER') {
      throw new DomainError('No se puede revocar al dueño primario', 403);
    }
    await this.accesses.revoke(memberUserId, patientId);
    await this.audit.log({
      actorId: actor.id,
      action: 'REVOKE',
      resourceType: 'PatientAccess',
      resourceId: memberUserId,
      patientId,
      ip,
    });
  }
}
