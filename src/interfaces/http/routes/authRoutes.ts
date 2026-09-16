import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
  refreshSchema,
  logoutSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  emailVerifyConfirmSchema,
} from '../dto/schemas';
import { authRateLimiter } from '../middleware/rateLimit';

export function authRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);

  router.post(
    '/register',
    authRateLimiter,
    validateBody(registerSchema),
    async (req, res, next) => {
      try {
        const result = await container.registerUser.execute(req.body, {
          userAgent: req.get('user-agent') || undefined,
          ip: req.ip,
        });
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/login', authRateLimiter, validateBody(loginSchema), async (req, res, next) => {
    try {
      const result = await container.loginUser.execute(req.body, {
        userAgent: req.get('user-agent') || undefined,
        ip: req.ip,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', authRateLimiter, validateBody(refreshSchema), async (req, res, next) => {
    try {
      const result = await container.refreshSession.execute(req.body.refreshToken, {
        userAgent: req.get('user-agent') || undefined,
        ip: req.ip,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', validateBody(logoutSchema), async (req, res, next) => {
    try {
      let actorId: string | undefined;
      try {
        const header = req.headers.authorization;
        if (header?.startsWith('Bearer ')) {
          const payload = container.tokens.verify(header.slice(7));
          actorId = payload.sub;
        }
      } catch {
        /* optional auth on logout */
      }
      const result = await container.logoutSession.execute(
        actorId,
        req.body.refreshToken,
        req.ip,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/password-reset/request',
    authRateLimiter,
    validateBody(passwordResetRequestSchema),
    async (req, res, next) => {
      try {
        const result = await container.requestPasswordReset.execute(req.body.email, req.ip);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/password-reset/confirm',
    authRateLimiter,
    validateBody(passwordResetConfirmSchema),
    async (req, res, next) => {
      try {
        const result = await container.confirmPasswordReset.execute(
          req.body.token,
          req.body.password,
          req.ip,
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/email-verification/request', auth, async (req, res, next) => {
    try {
      const result = await container.requestEmailVerification.execute(req.user!.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/email-verification/confirm',
    authRateLimiter,
    validateBody(emailVerifyConfirmSchema),
    async (req, res, next) => {
      try {
        const result = await container.confirmEmailVerification.execute(req.body.token, req.ip);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/profile', auth, async (req, res, next) => {
    try {
      const result = await container.getProfile.execute(req.user!.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.put('/profile', auth, validateBody(updateProfileSchema), async (req, res, next) => {
    try {
      const result = await container.updateProfile.execute(req.user!.id, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
