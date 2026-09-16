import { DomainError } from '../../domain/shared/DomainError';
import { UserRepository } from '../../domain/identity/UserRepository';
import { BcryptHasher } from '../../infrastructure/auth/BcryptHasher';

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  clinic?: string;
  address?: string;
  license?: string;
  photo?: string;
  password?: string;
}

export class UpdateProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptHasher,
  ) {}

  async execute(userId: string, input: UpdateProfileInput) {
    const existing = await this.users.findById(userId);
    if (!existing) {
      throw new DomainError('Usuario no encontrado', 404);
    }

    const data: UpdateProfileInput = { ...input };
    if (input.password) {
      data.password = await this.hasher.hash(input.password);
    }

    const user = await this.users.update(userId, data);
    return user.toPublic();
  }
}
