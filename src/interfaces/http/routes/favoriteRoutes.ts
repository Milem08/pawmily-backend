import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { favoriteSchema } from '../dto/schemas';

export function favoriteRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);
  router.use(auth);

  router.get('/', async (req, res, next) => {
    try {
      res.json(await container.listFavorites.execute(req.user!));
    } catch (err) {
      next(err);
    }
  });

  router.post('/', validateBody(favoriteSchema), async (req, res, next) => {
    try {
      const fav = await container.addFavorite.execute(req.user!, req.body);
      res.status(201).json(fav);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await container.removeFavorite.execute(req.user!, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
