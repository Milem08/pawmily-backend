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
    const raw = generateOpaqueToken(48);
    const nextHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + env.jwtRefreshDays * 24 * 60 * 60 * 1000);

    const rotated = await prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (consumed.count !== 1) return null;
      const existing = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!existing) return null;
      await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: nextHash,
          expiresAt,
          userAgent: meta?.userAgent ?? null,
          ip: meta?.ip ?? null,
        },
      });
      return { userId: existing.userId };
    });

    if (!rotated) return null;
    return { userId: rotated.userId, refreshToken: raw, expiresAt };
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
