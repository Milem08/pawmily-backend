import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { Role } from '../../domain/identity/Role';

export interface TokenPayload {
  sub: string;
  email: string;
  role: Role;
  typ?: 'access';
}

export class JwtTokenService {
  sign(payload: TokenPayload): string {
    return jwt.sign({ ...payload, typ: 'access' }, env.jwtSecret, {
      expiresIn: env.jwtAccessExpiration as jwt.SignOptions['expiresIn'],
    });
  }

  verify(token: string): TokenPayload {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  }
}
