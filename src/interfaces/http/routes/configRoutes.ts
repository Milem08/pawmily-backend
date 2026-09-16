import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { updateConfigSchema } from '../dto/schemas';

export function configRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);
  router.use(auth);

  router.get('/', async (req, res, next) => {
    try {
      const config = await container.getClinicConfig.execute(req.user!);
      res.json(config.props);
    } catch (err) {
      next(err);
    }
  });

  router.put('/', validateBody(updateConfigSchema), async (req, res, next) => {
    try {
      const config = await container.updateClinicConfig.execute(req.user!, req.body);
      res.json(config.props);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
