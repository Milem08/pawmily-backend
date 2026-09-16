import { DomainError } from '../../domain/shared/DomainError';
import { UserRepository } from '../../domain/identity/UserRepository';
import { SupabaseStorage } from '../../infrastructure/storage/SupabaseStorage';
import { resolvePatientPhotoUrl } from '../media/MediaUseCases';

export class GetProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly storage?: SupabaseStorage,
  ) {}

  async execute(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new DomainError('Usuario no encontrado', 404);
    }
    const pub = user.toPublic();
    if (this.storage) {
      const photo = await resolvePatientPhotoUrl(
        pub.photo,
        pub.photoAssetId,
        this.storage,
      );
      return { ...pub, photo: photo ?? pub.photo ?? null };
    }
    return pub;
  }
}
