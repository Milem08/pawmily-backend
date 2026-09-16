import { prisma } from '../persistence/prisma/prismaClient';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'REGISTER'
  | 'CREATE'
  | 'UPDATE'
  | 'VIEW'
  | 'DELETE'
  | 'LINK_REQUEST'
  | 'LINK_APPROVE'
  | 'LINK_REJECT'
  | 'REVOKE'
  | 'UPLOAD'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_CONFIRM'
  | 'EMAIL_VERIFY'
  | 'REFRESH';

export class AuditService {
  async log(input: {
    actorId?: string | null;
    action: AuditAction | string;
    resourceType: string;
    resourceId?: string | null;
    patientId?: string | null;
    meta?: Record<string, unknown> | null;
    ip?: string | null;
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          patientId: input.patientId ?? null,
          meta: input.meta ? JSON.stringify(input.meta) : null,
          ip: input.ip ?? null,
        },
      });
    } catch {
      // Audit must never break the main request path.
    }
  }
}
