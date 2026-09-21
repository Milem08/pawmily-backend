import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import {
  acceptAppointmentSchema,
  createAppointmentSchema,
  postponeAppointmentSchema,
  rejectAppointmentSchema,
  requestAppointmentSchema,
  suggestAppointmentSchema,
  updateAppointmentSchema,
} from '../dto/schemas';

export function appointmentRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);
  router.use(auth);

  router.post('/', validateBody(createAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.createAppointment.execute(req.user!, req.body);
      res.status(201).json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.post('/request', validateBody(requestAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.requestAppointment.execute(req.user!, req.body);
      res.status(201).json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.get('/mine', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const result = await container.listMyAppointments.execute(req.user!, { page, limit });
      res.json({
        data: result.items.map((a) => a.props),
        meta: { page, limit, total: result.total },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/confirm', async (req, res, next) => {
    try {
      const appointment = await container.confirmAppointmentAttendance.execute(
        req.user!,
        req.params.id,
      );
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/postpone', validateBody(postponeAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.postponeAppointment.execute(
        req.user!,
        req.params.id,
        req.body,
      );
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/suggest', validateBody(suggestAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.suggestAppointmentSlot.execute(
        req.user!,
        req.params.id,
        req.body,
      );
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/accept', validateBody(acceptAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.acceptAppointmentRequest.execute(
        req.user!,
        req.params.id,
        req.body,
      );
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/reject', validateBody(rejectAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.rejectAppointmentRequest.execute(
        req.user!,
        req.params.id,
        req.body,
      );
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const result = await container.listAppointments.execute(req.user!, { date, page, limit });
      res.json({
        data: result.items.map((a) => a.props),
        meta: { page, limit, total: result.total },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/month', async (req, res, next) => {
    try {
      const year = Number(req.query.year);
      const month = Number(req.query.month);
      const items = await container.listAppointmentsByMonth.execute(req.user!, year, month);
      res.json(items.map((a) => a.props));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const appointment = await container.getAppointment.execute(req.user!, req.params.id);
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', validateBody(updateAppointmentSchema), async (req, res, next) => {
    try {
      const appointment = await container.updateAppointment.execute(req.user!, req.params.id, req.body);
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const appointment = await container.deleteAppointment.execute(req.user!, req.params.id);
      res.json(appointment.props);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
