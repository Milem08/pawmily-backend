import { Request, Response, NextFunction } from 'express';
import { DomainError } from '../../../domain/shared/DomainError';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof DomainError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
  }

  const anyErr = err as { name?: string; message?: string; code?: string; status?: number; statusCode?: number; type?: string };

  if (anyErr?.type === 'entity.parse.failed' || anyErr?.status === 400 || anyErr?.statusCode === 400) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'JSON inválido en el cuerpo de la petición',
    });
  }

  if (anyErr?.name === 'PrismaClientInitializationError') {
    return res.status(503).json({
      error: 'DB_UNAVAILABLE',
      message:
        'No se pudo conectar a la base de datos. Verifica DATABASE_URL (host real de Supabase y sslmode=require).',
    });
  }

  console.error(err);
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
  });
}