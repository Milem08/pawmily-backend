import { LinkRequestRecord, LinkRequestRepository } from '../../../domain/access/LinkRequestRepository';
import { PatientAccessRole } from '../../../domain/access/PatientAccessRole';
import { prisma } from './prismaClient';

function map(row: any): LinkRequestRecord {
  return {
    id: row.id,
    requesterId: row.requesterId,
    patientId: row.patientId,
    requestedRole: row.requestedRole as PatientAccessRole,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    requesterName: row.requester?.name,
    requesterEmail: row.requester?.email,
    patientName: row.patient?.name,
    patientCode: row.patient?.code,
  };
}

export class PrismaLinkRequestRepository implements LinkRequestRepository {
  async create(data: {
    requesterId: string;
    patientId: string;
    requestedRole: PatientAccessRole;
  }): Promise<LinkRequestRecord> {
    const row = await prisma.linkRequest.create({
      data: {
        requesterId: data.requesterId,
        patientId: data.patientId,
        requestedRole: data.requestedRole,
        status: 'PENDING',
      },
      include: {
        requester: { select: { name: true, email: true } },
        patient: { select: { name: true, code: true } },
      },
    });
    return map(row);
  }

  async findById(id: string): Promise<LinkRequestRecord | null> {
    const row = await prisma.linkRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { name: true, email: true } },
        patient: { select: { name: true, code: true, vetId: true, ownerUserId: true } },
      },
    });
    return row ? map(row) : null;
  }

  async findPending(requesterId: string, patientId: string): Promise<LinkRequestRecord | null> {
    const row = await prisma.linkRequest.findFirst({
      where: { requesterId, patientId, status: 'PENDING' },
      include: {
        requester: { select: { name: true, email: true } },
        patient: { select: { name: true, code: true } },
      },
    });
    return row ? map(row) : null;
  }

  async listPendingForPatient(patientId: string): Promise<LinkRequestRecord[]> {
    const rows = await prisma.linkRequest.findMany({
      where: { patientId, status: 'PENDING' },
      include: {
        requester: { select: { name: true, email: true } },
        patient: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(map);
  }

  async listPendingForVet(vetId: string): Promise<LinkRequestRecord[]> {
    const rows = await prisma.linkRequest.findMany({
      where: {
        status: 'PENDING',
        requestedRole: 'OWNER',
        patient: { vetId },
      },
      include: {
        requester: { select: { name: true, email: true } },
        patient: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(map);
  }

  async listPendingForOwner(ownerUserId: string): Promise<LinkRequestRecord[]> {
    const rows = await prisma.linkRequest.findMany({
      where: {
        status: 'PENDING',
        requestedRole: { in: ['CO_OWNER', 'CAREGIVER'] },
        OR: [
          { patient: { ownerUserId } },
          {
            patient: {
              accesses: {
                some: { userId: ownerUserId, role: 'OWNER', status: 'ACTIVE', revokedAt: null },
              },
            },
          },
        ],
      },
      include: {
        requester: { select: { name: true, email: true } },
        patient: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(map);
  }

  async decidePending(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    decidedBy: string,
  ): Promise<LinkRequestRecord | null> {
    const result = await prisma.linkRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status, decidedBy, decidedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  async approveWithGrant(data: {
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
  }): Promise<LinkRequestRecord> {
    return prisma.$transaction(async (tx) => {
      await tx.patientAccess.upsert({
        where: {
          userId_patientId: { userId: data.userId, patientId: data.patientId },
        },
        create: {
          userId: data.userId,
          patientId: data.patientId,
          role: data.role,
          status: 'ACTIVE',
          grantedBy: data.decidedBy,
        },
        update: {
          role: data.role,
          status: 'ACTIVE',
          revokedAt: null,
          grantedBy: data.decidedBy,
        },
      });

      if (data.claimOwner) {
        await tx.patient.update({
          where: { id: data.patientId },
          data: {
            ownerUserId: data.userId,
            ownerName: data.claimOwner.ownerName,
            ownerPhone: data.claimOwner.ownerPhone ?? null,
            ownerEmail: data.claimOwner.ownerEmail ?? null,
          },
        });
      }

      const decided = await tx.linkRequest.updateMany({
        where: { id: data.requestId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedBy: data.decidedBy,
          decidedAt: new Date(),
        },
      });
      if (decided.count === 0) {
        throw new Error('LINK_REQUEST_NOT_PENDING');
      }

      const row = await tx.linkRequest.findUnique({
        where: { id: data.requestId },
        include: {
          requester: { select: { name: true, email: true } },
          patient: { select: { name: true, code: true } },
        },
      });
      if (!row) {
        throw new Error('LINK_REQUEST_MISSING');
      }
      return map(row);
    });
  }
}
