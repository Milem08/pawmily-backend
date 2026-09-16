import { Request, Response, NextFunction } from 'express';
import { JwtTokenService } from '../../../infrastructure/auth/JwtTokenService';
import { DomainError } from '../../../domain/shared/DomainError';
import { Role } from '../../../domain/identity/Role';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authMiddleware(tokens: JwtTokenService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new DomainError('No autorizado', 401));
    }
    try {
      const payload = tokens.verify(header.slice(7));
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      next();
    } catch {
      next(new DomainError('Token inválido o expirado', 401));
    }
  };
}
