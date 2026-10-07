import { DomainError } from '../../domain/shared/DomainError';
import { UserRepository } from '../../domain/identity/UserRepository';
import { BcryptHasher } from '../../infrastructure/auth/BcryptHasher';
import { RefreshTokenStore } from '../../infrastructure/auth/RefreshTokenStore';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  clinic?: string;
  address?: string;
  license?: string;
  photo?: string;
  password?: string;
  currentPassword?: string;
}

export class UpdateProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptHasher,
    private readonly refreshTokens: RefreshTokenStore,
  ) {}

  async execute(userId: string, input: UpdateProfileInput) {
    const existing = await this.users.findById(userId);
    if (!existing) {
      throw new DomainError('Usuario no encontrado', 404);
    }

    const { currentPassword, password, ...rest } = input;
    const data: Omit<UpdateProfileInput, 'currentPassword' | 'password'> & { password?: string } = {
      ...rest,
    };
    if (input.email) {
      const normalized = input.email.trim().toLowerCase();
      const other = await this.users.findByEmail(normalized);
      if (other && other.id !== userId) {
        throw new DomainError('Ese correo ya está en uso', 409);
      }
      data.email = normalized;
    }
    if (input.phone && input.phone.trim()) {
      const taken = await this.users.isPhoneUsedByOther(userId, input.phone);
      if (taken) {
        throw new DomainError('Ese teléfono ya está en uso', 409);
      }
    }
    if (password) {
      if (!currentPassword) {
        throw new DomainError('La contraseña actual es obligatoria', 400);
      }
      const matches = await this.hasher.compare(currentPassword, existing.props.password);
      if (!matches) {
        throw new DomainError('La contraseña actual es incorrecta', 401);
      }
      data.password = await this.hasher.hash(password);
    }

    const user = await this.users.update(userId, data);
    if (password) {
      await this.refreshTokens.revokeAllForUser(userId);
    }
    return user.toPublic();
  }
}
