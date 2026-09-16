import { prisma } from '../persistence/prisma/prismaClient';
import { generateOpaqueToken, hashToken } from './TokenHash';
import { env } from '../config/env';

export class RefreshTokenStore {
  async issue(userId: string, meta?: { userAgent?: string; ip?: string }) {
    const raw = generateOpaqueToken(48);
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + env.jwtRefreshDays * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: meta?.userAgent ?? null,
        ip: meta?.ip ?? null,
      },
    });
    return { refreshToken: raw, expiresAt };
  }

  async rotate(rawToken: string, meta?: { userAgent?: string; ip?: string }) {
    const tokenHash = hashToken(rawToken);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      return null;
    }
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
    const next = await this.issue(existing.userId, meta);
    return { userId: existing.userId, ...next };
  }

  async revoke(rawToken: string): Promise<boolean> {
    const tokenHash = hashToken(rawToken);
    const result = await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
