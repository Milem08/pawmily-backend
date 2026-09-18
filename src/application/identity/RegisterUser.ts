import { DomainError } from '../../domain/shared/DomainError';
import { Role, isRole } from '../../domain/identity/Role';
import { UserRepository } from '../../domain/identity/UserRepository';
import { BcryptHasher } from '../../infrastructure/auth/BcryptHasher';
import { IssueSession } from './AuthSessionUseCases';
import { AuditService } from '../../infrastructure/audit/AuditService';
import { RequestEmailVerification } from './AuthSessionUseCases';

export interface RegisterUserInput {
  email?: string;
  phone?: string;
  password: string;
  name: string;
  role?: string;
  clinic?: string;
  address?: string;
  license?: string;
  photo?: string;
}

export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptHasher,
    private readonly sessions: IssueSession,
    private readonly audit: AuditService,
    private readonly emailVerification: RequestEmailVerification,
  ) {}

  async execute(input: RegisterUserInput, meta?: { userAgent?: string; ip?: string }) {
    const email = (input.email || (input.phone ? `${input.phone}@pawmily.phone` : ''))
      .trim()
      .toLowerCase();
    if (!email) {
      throw new DomainError('Email or phone is required', 400);
    }
    if (!input.password || input.password.length < 6) {
      throw new DomainError('Password must be at least 6 characters', 400);
    }
    if (!input.name?.trim()) {
      throw new DomainError('Name is required', 400);
    }

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new DomainError('Este correo ya está registrado', 409);
    }

    if (input.phone) {
      const byPhone = await this.users.findByPhone(input.phone);
      if (byPhone) {
        throw new DomainError('Este teléfono ya está registrado', 409);
      }
    }

    let role: Role = 'vet';
    if (input.role && isRole(input.role)) {
      role = input.role;
    } else if (input.phone && !input.email) {
      role = 'owner';
    }

    const hashed = await this.hasher.hash(input.password);
    const user = await this.users.create({
      email,
      password: hashed,
      name: input.name.trim(),
      role,
      phone: input.phone ?? null,
      clinic: input.clinic ?? null,
      address: input.address ?? null,
      license: input.license ?? null,
      photo: input.photo ?? null,
    });

    const session = await this.sessions.forUser(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );

    await this.audit.log({
      actorId: user.id,
      action: 'REGISTER',
      resourceType: 'User',
      resourceId: user.id,
      ip: meta?.ip,
    });

    if (input.email) {
      await this.emailVerification.execute(user.id).catch(() => undefined);
    }

    return { ...session, user: user.toPublic() };
  }
}
