import { randomUUID } from 'crypto';
import { DomainError } from '../../domain/shared/DomainError';
import { PatientRepository } from '../../domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../domain/access/PatientAccessRepository';
import { authorizePatientAction, AuthActor } from '../access/authorizePatientAction';
import { SupabaseStorage } from '../../infrastructure/storage/SupabaseStorage';
import { AuditService } from '../../infrastructure/audit/AuditService';
import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';
import { UserRepository } from '../../domain/identity/UserRepository';

export class CreateMediaUploadUrl {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly storage: SupabaseStorage,
    private readonly audit: AuditService,
  ) {}

  async execute(
    actor: AuthActor,
    input: {
      patientId?: string;
      mimeType: string;
      sizeBytes: number;
      kind?: 'pet' | 'clinical' | 'user_avatar';
    },
  ) {
    this.storage.assertMime(input.mimeType);
    this.storage.assertSize(input.sizeBytes);

    const kind = input.kind ?? 'pet';
    if (kind === 'user_avatar') {
      const bucket = this.storage.petBucket();
      const ext = input.mimeType.split('/')[1] || 'bin';
      const storageKey = `users/${actor.id}/${randomUUID()}.${ext}`;
      const signed = await this.storage.createSignedUploadUrl(bucket, storageKey);
      const asset = await prisma.mediaAsset.create({
        data: {
          storageKey,
          bucket,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          visibility: 'private',
          kind: 'user_avatar',
          patientId: null,
          uploadedBy: actor.id,
        },
      });
      await this.audit.log({
        actorId: actor.id,
        action: 'UPLOAD',
        resourceType: 'MediaAsset',
        resourceId: asset.id,
      });
      return { assetId: asset.id, bucket, storageKey, upload: signed };
    }

    if (!input.patientId) {
      throw new DomainError('patientId es requerido', 400);
    }
    await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      input.patientId,
      'UPLOAD_MEDIA',
    );
    if (kind === 'clinical' && actor.role !== 'vet') {
      throw new DomainError('Solo veterinarios suben assets clínicos', 403);
    }

    const bucket = kind === 'clinical' ? this.storage.clinicalBucket() : this.storage.petBucket();
    const ext = input.mimeType.split('/')[1] || 'bin';
    const storageKey = `${input.patientId}/${randomUUID()}.${ext}`;
    const signed = await this.storage.createSignedUploadUrl(bucket, storageKey);

    const asset = await prisma.mediaAsset.create({
      data: {
        storageKey,
        bucket,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        visibility: 'private',
        kind,
        patientId: input.patientId,
        uploadedBy: actor.id,
      },
    });

    await this.audit.log({
      actorId: actor.id,
      action: 'UPLOAD',
      resourceType: 'MediaAsset',
      resourceId: asset.id,
      patientId: input.patientId,
    });

    return {
      assetId: asset.id,
      bucket,
      storageKey,
      upload: signed,
    };
  }
}

export class ConfirmMediaUpload {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly users?: UserRepository,
  ) {}

  async execute(
    actor: AuthActor,
    assetId: string,
    setAsPatientPhoto?: boolean,
    setAsUserPhoto?: boolean,
  ) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new DomainError('Asset no encontrado', 404);
    }

    if (setAsUserPhoto || asset.kind === 'user_avatar') {
      if (asset.uploadedBy !== actor.id) {
        throw new DomainError('No autorizado', 403);
      }
      if (this.users) {
        await this.users.update(actor.id, {
          photo: `asset:${asset.id}`,
          photoAssetId: asset.id,
        } as never);
      } else {
        await prisma.user.update({
          where: { id: actor.id },
          data: { photo: `asset:${asset.id}`, photoAssetId: asset.id },
        });
      }
      return asset;
    }

    if (!asset.patientId) {
      throw new DomainError('Asset no encontrado', 404);
    }
    await authorizePatientAction(
      this.patients,
      this.accesses,
      actor,
      asset.patientId,
      'UPLOAD_MEDIA',
    );

    if (setAsPatientPhoto) {
      await this.patients.update(asset.patientId, {
        photo: `asset:${asset.id}`,
        photoAssetId: asset.id,
      } as never);
    }

    return asset;
  }
}

export class GetMediaSignedUrl {
  constructor(
    private readonly patients: PatientRepository,
    private readonly accesses: PatientAccessRepository,
    private readonly storage: SupabaseStorage,
  ) {}

  async execute(actor: AuthActor, assetId: string) {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) {
      throw new DomainError('Asset no encontrado', 404);
    }
    if (asset.kind === 'user_avatar') {
      if (asset.uploadedBy !== actor.id) {
        throw new DomainError('No autorizado', 403);
      }
    } else {
      if (!asset.patientId) throw new DomainError('Asset no encontrado', 404);
      await authorizePatientAction(this.patients, this.accesses, actor, asset.patientId, 'READ');
    }
    const url = await this.storage.createSignedReadUrl(asset.bucket, asset.storageKey);
    return { url, expiresIn: 3600, assetId: asset.id, mimeType: asset.mimeType };
  }
}

/** Dual-read helper: data URL / http URL / asset:id → signed URL when possible. Never throws. */
export async function resolvePatientPhotoUrl(
  photo: string | null | undefined,
  photoAssetId: string | null | undefined,
  storage: SupabaseStorage,
): Promise<string | null> {
  try {
    if (photoAssetId) {
      const asset = await prisma.mediaAsset.findUnique({ where: { id: photoAssetId } });
      if (asset) {
        return await storage.createSignedReadUrl(asset.bucket, asset.storageKey);
      }
    }
    if (!photo) return null;
    if (photo.startsWith('asset:')) {
      const id = photo.slice('asset:'.length);
      const asset = await prisma.mediaAsset.findUnique({ where: { id } });
      if (!asset) return null;
      return await storage.createSignedReadUrl(asset.bucket, asset.storageKey);
    }
    return photo;
  } catch {
    if (photo && !photo.startsWith('asset:')) return photo;
    return null;
  }
}
