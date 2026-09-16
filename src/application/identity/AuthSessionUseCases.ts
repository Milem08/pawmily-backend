import { DomainError } from '../../domain/shared/DomainError';
import { UserRepository } from '../../domain/identity/UserRepository';
import { BcryptHasher } from '../../infrastructure/auth/BcryptHasher';
import { JwtTokenService } from '../../infrastructure/auth/JwtTokenService';
import { RefreshTokenStore } from '../../infrastructure/auth/RefreshTokenStore';
import { generateOpaqueToken, hashToken } from '../../infrastructure/auth/TokenHash';
import { EmailSender } from '../../infrastructure/email/EmailSender';
import { AuditService } from '../../infrastructure/audit/AuditService';
import { prisma } from '../../infrastructure/persistence/prisma/prismaClient';
import { env } from '../../infrastructure/config/env';

export class IssueSession {
  constructor(
    private readonly tokens: JwtTokenService,
    private readonly refreshStore: RefreshTokenStore,
  ) {}

  async forUser(
    user: { id: string; email: string; role: 'vet' | 'owner' },
    meta?: { userAgent?: string; ip?: string },
  ) {
    const accessToken = this.tokens.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const { refreshToken, expiresAt } = await this.refreshStore.issue(user.id, meta);
    return {
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      tokenType: 'Bearer' as const,
      expiresIn: env.jwtAccessExpiration,
    };
  }
}

export class RefreshSession {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: JwtTokenService,
    private readonly refreshStore: RefreshTokenStore,
    private readonly audit: AuditService,
  ) {}

  async execute(refreshToken: string, meta?: { userAgent?: string; ip?: string }) {
    const rotated = await this.refreshStore.rotate(refreshToken, meta);
    if (!rotated) {
      throw new DomainError('Refresh token inválido o expirado', 401);
    }
    const user = await this.users.findById(rotated.userId);
    if (!user) {
      throw new DomainError('Usuario no encontrado', 401);
    }
    const accessToken = this.tokens.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    await this.audit.log({
      actorId: user.id,
      action: 'REFRESH',
      resourceType: 'Session',
      ip: meta?.ip,
    });
    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      refreshExpiresAt: rotated.expiresAt,
      tokenType: 'Bearer' as const,
      expiresIn: env.jwtAccessExpiration,
      user: user.toPublic(),
    };
  }
}

export class LogoutSession {
  constructor(
    private readonly refreshStore: RefreshTokenStore,
    private readonly audit: AuditService,
  ) {}

  async execute(actorId: string | undefined, refreshToken?: string, ip?: string) {
    if (refreshToken) {
      await this.refreshStore.revoke(refreshToken);
    } else if (actorId) {
      await this.refreshStore.revokeAllForUser(actorId);
    }
    await this.audit.log({
      actorId: actorId ?? null,
      action: 'LOGOUT',
      resourceType: 'Session',
      ip,
    });
    return { ok: true };
  }
}

export class RequestPasswordReset {
  constructor(
    private readonly users: UserRepository,
    private readonly email: EmailSender,
    private readonly audit: AuditService,
  ) {}

  async execute(email: string, ip?: string) {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    // Always return ok to avoid email enumeration
    if (!user) {
      return { ok: true };
    }
    const raw = generateOpaqueToken(32);
    const tokenHash = hashToken(raw);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const link = `${env.appPublicUrl}/auth/reset.html?token=${encodeURIComponent(raw)}`;
    await this.email.send(
      user.email,
      'Restablecer contraseña — PawMily',
      `Usa este enlace para restablecer tu contraseña (válido 1 hora):\n\n${link}\n\nSi no lo pediste, ignora este mensaje.`,
    );
    await this.audit.log({
      actorId: user.id,
      action: 'PASSWORD_RESET_REQUEST',
      resourceType: 'User',
      resourceId: user.id,
      ip,
    });
    return { ok: true };
  }
}

export class ConfirmPasswordReset {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptHasher,
    private readonly refreshStore: RefreshTokenStore,
    private readonly audit: AuditService,
  ) {}

  async execute(token: string, newPassword: string, ip?: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new DomainError('Password must be at least 6 characters', 400);
    }
    const tokenHash = hashToken(token);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new DomainError('Token inválido o expirado', 400);
    }
    const hashed = await this.hasher.hash(newPassword);
    await this.users.update(row.userId, { password: hashed });
    await prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await this.refreshStore.revokeAllForUser(row.userId);
    await this.audit.log({
      actorId: row.userId,
      action: 'PASSWORD_RESET_CONFIRM',
      resourceType: 'User',
      resourceId: row.userId,
      ip,
    });
    return { ok: true };
  }
}

export class RequestEmailVerification {
  constructor(
    private readonly users: UserRepository,
    private readonly email: EmailSender,
  ) {}

  async execute(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('Usuario no encontrado', 404);
    const raw = generateOpaqueToken(32);
    await prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    const link = `${env.appPublicUrl}/auth/verify.html?token=${encodeURIComponent(raw)}`;
    await this.email.send(
      user.email,
      'Verifica tu correo — PawMily',
      `Confirma tu correo abriendo este enlace:\n\n${link}`,
    );
    return { ok: true };
  }
}

export class ConfirmEmailVerification {
  constructor(private readonly audit: AuditService) {}

  async execute(token: string, ip?: string) {
    const tokenHash = hashToken(token);
    const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new DomainError('Token inválido o expirado', 400);
    }
    await prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await prisma.emailVerificationToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await this.audit.log({
      actorId: row.userId,
      action: 'EMAIL_VERIFY',
      resourceType: 'User',
      resourceId: row.userId,
      ip,
    });
    return { ok: true };
  }
}
