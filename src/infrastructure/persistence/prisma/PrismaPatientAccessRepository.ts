import { PatientAccessGrant, PatientAccessRepository } from '../../../domain/access/PatientAccessRepository';
import { PatientAccessRole } from '../../../domain/access/PatientAccessRole';
import { prisma } from './prismaClient';

function map(row: any): PatientAccessGrant {
  return {
    id: row.id,
    userId: row.userId,
    patientId: row.patientId,
    role: row.role as PatientAccessRole,
    status: row.status,
    grantedBy: row.grantedBy,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    userName: row.user?.name,
    userEmail: row.user?.email,
  };
}

export class PrismaPatientAccessRepository implements PatientAccessRepository {
  async findActive(userId: string, patientId: string): Promise<PatientAccessGrant | null> {
    const row = await prisma.patientAccess.findFirst({
      where: { userId, patientId, status: 'ACTIVE', revokedAt: null },
      include: { user: { select: { name: true, email: true } } },
    });
    return row ? map(row) : null;
  }

  async listActiveForPatient(patientId: string): Promise<PatientAccessGrant[]> {
    const rows = await prisma.patientAccess.findMany({
      where: { patientId, status: 'ACTIVE', revokedAt: null },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(map);
  }

  async listActivePatientIdsForUser(userId: string): Promise<string[]> {
    const rows = await prisma.patientAccess.findMany({
      where: { userId, status: 'ACTIVE', revokedAt: null },
      select: { patientId: true },
    });
    return rows.map((r) => r.patientId);
  }

  async upsertActive(data: {
    userId: string;
    patientId: string;
    role: PatientAccessRole;
    grantedBy?: string | null;
  }): Promise<PatientAccessGrant> {
    const row = await prisma.patientAccess.upsert({
      where: { userId_patientId: { userId: data.userId, patientId: data.patientId } },
      create: {
        userId: data.userId,
        patientId: data.patientId,
        role: data.role,
        status: 'ACTIVE',
        grantedBy: data.grantedBy ?? null,
      },
      update: {
        role: data.role,
        status: 'ACTIVE',
        revokedAt: null,
        grantedBy: data.grantedBy ?? null,
      },
      include: { user: { select: { name: true, email: true } } },
    });
    return map(row);
  }

  async revoke(userId: string, patientId: string): Promise<void> {
    await prisma.patientAccess.updateMany({
      where: { userId, patientId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  async findActiveOwner(patientId: string): Promise<PatientAccessGrant | null> {
    const row = await prisma.patientAccess.findFirst({
      where: { patientId, role: 'OWNER', status: 'ACTIVE', revokedAt: null },
      include: { user: { select: { name: true, email: true } } },
    });
    return row ? map(row) : null;
  }
}
