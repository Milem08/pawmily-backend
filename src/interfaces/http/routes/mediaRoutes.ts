import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { mediaConfirmSchema, mediaUploadUrlSchema } from '../dto/schemas';

export function mediaRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);
  router.use(auth);

  router.post('/upload-url', validateBody(mediaUploadUrlSchema), async (req, res, next) => {
    try {
      const result = await container.createMediaUploadUrl.execute(req.user!, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/confirm', validateBody(mediaConfirmSchema), async (req, res, next) => {
    try {
      const result = await container.confirmMediaUpload.execute(
        req.user!,
        req.body.assetId,
        req.body.setAsPatientPhoto,
        req.body.setAsUserPhoto,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:assetId/url', async (req, res, next) => {
    try {
      const result = await container.getMediaSignedUrl.execute(req.user!, req.params.assetId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
