import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { healthRoutes } from './healthRoutes';
import { authRoutes } from './authRoutes';
import { patientRoutes } from './patientRoutes';
import { appointmentRoutes } from './appointmentRoutes';
import { configRoutes } from './configRoutes';
import { mediaRoutes } from './mediaRoutes';
import { favoriteRoutes } from './favoriteRoutes';
import { inboxRoutes } from './inboxRoutes';

export function buildApiRouter(container: Container): Router {
  const api = Router();
  api.use(healthRoutes);
  api.use('/auth', authRoutes(container));
  api.use('/patients', patientRoutes(container));
  api.use('/appointments', appointmentRoutes(container));
  api.use('/config', configRoutes(container));
  api.use('/media', mediaRoutes(container));
  api.use('/favorites', favoriteRoutes(container));
  api.use('/inbox', inboxRoutes(container));
  return api;
}
