import { DomainError } from '../../domain/shared/DomainError';
import { UserRepository } from '../../domain/identity/UserRepository';
import { BcryptHasher } from '../../infrastructure/auth/BcryptHasher';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
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
    if (input.email) {
      const normalized = input.email.trim().toLowerCase();
      const other = await this.users.findByEmail(normalized);
      if (other && other.id !== userId) {
        throw new DomainError('Ese correo ya está en uso', 409);
      }
      data.email = normalized;
    }
    if (input.password) {
      data.password = await this.hasher.hash(input.password);
    }

    const user = await this.users.update(userId, data);
    return user.toPublic();
  }
}
