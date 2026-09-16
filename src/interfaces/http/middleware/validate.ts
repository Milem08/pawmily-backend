import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { DomainError } from '../../../domain/shared/DomainError';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(
        new DomainError(parsed.error.errors.map((e) => e.message).join('; '), 400, 'VALIDATION_ERROR'),
      );
    }
    req.body = parsed.data;
    next();
  };
}
