import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../infrastructure/config/env';
import { createContainer } from '../../infrastructure/container';
import { buildApiRouter } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { apiRateLimiter } from './middleware/rateLimit';

export function createApp() {
  const app = express();
  const container = createContainer();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        const allowed =
          !env.corsOrigins.length ||
          env.corsOrigins.includes(origin) ||
          env.corsOrigins.includes('*') ||
          /^https:\/\/[\w-]+\.vercel\.app$/i.test(origin);
        callback(null, allowed);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);
  app.use('/api', apiRateLimiter);
  app.use('/api', buildApiRouter(container));
  app.use(errorHandler);

  return app;
}
