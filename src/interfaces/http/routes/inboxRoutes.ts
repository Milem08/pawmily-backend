import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import {
  listClinicMessagesForUser,
  markAllClinicMessagesRead,
  markClinicMessageRead,
} from '../../../application/inbox/ClinicInbox';

export function inboxRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);
  router.use(auth);

  router.get('/', async (req, res, next) => {
    try {
      const unreadOnly = String(req.query.unreadOnly || '') === 'true';
      const limit = Number(req.query.limit ?? 50);
      const messages = await listClinicMessagesForUser(req.user!.id, { unreadOnly, limit });
      res.json({ data: messages });
    } catch (err) {
      next(err);
    }
  });

  router.post('/read-all', async (req, res, next) => {
    try {
      const count = await markAllClinicMessagesRead(req.user!.id);
      res.json({ marked: count });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/read', async (req, res, next) => {
    try {
      const message = await markClinicMessageRead(req.user!.id, req.params.id);
      if (!message) {
        res.status(404).json({ error: 'Mensaje no encontrado' });
        return;
      }
      res.json(message);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
