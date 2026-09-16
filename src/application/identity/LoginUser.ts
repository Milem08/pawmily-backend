import { DomainError } from '../../domain/shared/DomainError';
import { UserRepository } from '../../domain/identity/UserRepository';
import { BcryptHasher } from '../../infrastructure/auth/BcryptHasher';
import { IssueSession } from './AuthSessionUseCases';
import { AuditService } from '../../infrastructure/audit/AuditService';

export interface LoginUserInput {
  email?: string;
  phone?: string;
  password: string;
}

export class LoginUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptHasher,
    private readonly sessions: IssueSession,
    private readonly audit: AuditService,
  ) {}

  async execute(input: LoginUserInput, meta?: { userAgent?: string; ip?: string }) {
    if (!input.password) {
      throw new DomainError('Password is required', 400);
    }

    let user = null;
    if (input.email) {
      user = await this.users.findByEmail(input.email.trim().toLowerCase());
    } else if (input.phone) {
      user = await this.users.findByPhone(input.phone.trim());
      if (!user) {
        const synthetic = `${input.phone.trim()}@pawmily.phone`;
        user = await this.users.findByEmail(synthetic);
      }
    } else {
      throw new DomainError('Email or phone is required', 400);
    }

    if (!user) {
      throw new DomainError('Correo o contraseña incorrectos', 401);
    }

    const valid = await this.hasher.compare(input.password, user.props.password);
    if (!valid) {
      throw new DomainError('Correo o contraseña incorrectos', 401);
    }

    const session = await this.sessions.forUser(
      { id: user.id, email: user.email, role: user.role },
      meta,
    );

    await this.audit.log({
      actorId: user.id,
      action: 'LOGIN',
      resourceType: 'Session',
      ip: meta?.ip,
    });

    return { ...session, user: user.toPublic() };
  }
}
