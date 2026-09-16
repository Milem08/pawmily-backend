import { Router } from 'express';
import { Container } from '../../../infrastructure/container';
import { authMiddleware } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import {
  createPatientSchema,
  dietSchema,
  feedingLogSchema,
  feedingSchema,
  linkPatientSchema,
  linkRequestSchema,
  medicalRecordSchema,
  reminderSchema,
  updateMedicalRecordSchema,
  updatePatientSchema,
  updateReminderSchema,
} from '../dto/schemas';
import { linkRequestRateLimiter } from '../middleware/rateLimit';
import { resolvePatientPhotoUrl } from '../../../application/media/MediaUseCases';
import { SupabaseStorage } from '../../../infrastructure/storage/SupabaseStorage';
import { prisma } from '../../../infrastructure/persistence/prisma/prismaClient';
import {
  idempotencyBegin,
  idempotencyComplete,
  idempotencyFail,
  idempotencyLookup,
} from '../../../infrastructure/idempotency/IdempotencyStore';

type LinkStatus = 'LINKED' | 'UNLINKED' | 'PENDING';

type ClientPatientOptions = {
  /** Prefer signed asset URLs; keep embedded photos when no asset exists. */
  lean?: boolean;
  /** Precomputed link status to avoid N+1 queries. */
  linkStatus?: LinkStatus;
};

function displayableEmbeddedPhoto(photo: string | null): string | null {
  if (!photo) return null;
  if (photo.startsWith('asset:')) return null;
  // Relative placeholders are not usable as remote URLs for clients.
  if (photo.startsWith('../') || photo.startsWith('./') || photo.startsWith('assets/')) {
    return null;
  }
  return photo;
}

/** Resolve asset: refs to signed URLs; keep data:/https: as-is. Never persist signed URLs. */
async function toClientPatient(
  props: Record<string, unknown>,
  storage: SupabaseStorage,
  options: ClientPatientOptions = {},
) {
  const rawPhoto = (props.photo as string | null | undefined) ?? null;
  const photoAssetId = (props.photoAssetId as string | null | undefined) ?? null;
  let photo: string | null = null;

  if (options.lean) {
    // List views: prefer signed URLs from MediaAsset; do NOT drop data-URL photos
    // when that is the only stored image (otherwise web/Android show placeholders).
    if (photoAssetId) {
      const resolved = await resolvePatientPhotoUrl(rawPhoto, photoAssetId, storage);
      photo =
        resolved && !resolved.startsWith('asset:')
          ? resolved
          : displayableEmbeddedPhoto(rawPhoto);
    } else {
      photo = displayableEmbeddedPhoto(rawPhoto);
    }
  } else {
    const resolved = await resolvePatientPhotoUrl(rawPhoto, photoAssetId, storage);
    photo =
      resolved && !resolved.startsWith('asset:')
        ? resolved
        : displayableEmbeddedPhoto(rawPhoto);
  }

  const patientId = props.id as string | undefined;
  let linkStatus: LinkStatus = options.linkStatus ?? 'UNLINKED';
  if (!options.linkStatus && patientId) {
    if (props.ownerUserId) {
      linkStatus = 'LINKED';
    } else {
      const pending = await prisma.linkRequest.count({
        where: { patientId, status: 'PENDING', requestedRole: 'OWNER' },
      });
      linkStatus = pending > 0 ? 'PENDING' : 'UNLINKED';
    }
  }

  return {
    ...props,
    photo,
    photoUrl: photo,
    photoAssetId,
    barcodePayload: (props.barcodePayload as string | undefined) || (props.code as string),
    accessRole: props.accessRole ?? null,
    previousCode: props.previousCode ?? null,
    linkStatus,
  };
}

async function toClientPatientList(
  items: Array<{ props: Record<string, unknown> }>,
  storage: SupabaseStorage,
) {
  const idsNeedingPending = items
    .map((p) => p.props)
    .filter((props) => props.id && !props.ownerUserId)
    .map((props) => props.id as string);

  const pendingRows =
    idsNeedingPending.length === 0
      ? []
      : await prisma.linkRequest.findMany({
          where: {
            patientId: { in: idsNeedingPending },
            status: 'PENDING',
            requestedRole: 'OWNER',
          },
          select: { patientId: true },
          distinct: ['patientId'],
        });
  const pendingSet = new Set(pendingRows.map((r) => r.patientId));

  return Promise.all(
    items.map((p) => {
      const props = p.props;
      const id = props.id as string | undefined;
      const linkStatus: LinkStatus = props.ownerUserId
        ? 'LINKED'
        : id && pendingSet.has(id)
          ? 'PENDING'
          : 'UNLINKED';
      return toClientPatient(props, storage, { lean: true, linkStatus });
    }),
  );
}

export function patientRoutes(container: Container): Router {
  const router = Router();
  const auth = authMiddleware(container.tokens);
  const storage = container.storage;

  router.use(auth);

  router.post('/', validateBody(createPatientSchema), async (req, res, next) => {
    const rawKey = req.get('Idempotency-Key') || req.get('idempotency-key');
    const idemKey =
      typeof rawKey === 'string' && rawKey.trim().length > 0
        ? `${req.user!.id}:${rawKey.trim().slice(0, 128)}`
        : null;

    try {
      if (idemKey) {
        const existing = idempotencyLookup(idemKey);
        if (existing?.status === 'done') {
          return res.status(existing.statusCode).json(existing.body);
        }
        if (existing?.status === 'pending') {
          return res.status(409).json({
            message: 'Solicitud de creación ya en proceso. Espera un momento.',
          });
        }
        if (!idempotencyBegin(idemKey)) {
          return res.status(409).json({
            message: 'Solicitud de creación ya en proceso. Espera un momento.',
          });
        }
      }

      const patient = await container.createPatient.execute(req.user!, req.body);
      const body = await toClientPatient(
        patient.props as unknown as Record<string, unknown>,
        storage,
      );
      if (idemKey) idempotencyComplete(idemKey, 201, body);
      res.status(201).json(body);
    } catch (err) {
      if (idemKey) idempotencyFail(idemKey);
      next(err);
    }
  });

  router.post('/migrate-codes', async (req, res, next) => {
    try {
      const result = await container.migrateAllPatientCodes.execute(req.user!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const result = await container.listPatients.execute(req.user!, { search, page, limit });
      res.json({
        data: await toClientPatientList(
          result.items.map((p) => ({
            props: p.props as unknown as Record<string, unknown>,
          })),
          storage,
        ),
        meta: { page, limit, total: result.total },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mine', async (req, res, next) => {
    try {
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const result = await container.listMyPatients.execute(req.user!, { page, limit });
      res.json({
        data: await toClientPatientList(
          result.items.map((p) => ({
            props: p.props as unknown as Record<string, unknown>,
          })),
          storage,
        ),
        meta: { page, limit, total: result.total },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/link-lookup/:code', async (req, res, next) => {
    try {
      const result = await container.lookupPatientForLink.execute(req.user!, req.params.code);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/link-requests',
    linkRequestRateLimiter,
    validateBody(linkRequestSchema),
    async (req, res, next) => {
      try {
        const result = await container.createLinkRequest.execute(req.user!, req.body, req.ip);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/link-requests/pending', async (req, res, next) => {
    try {
      const result = await container.listPendingLinkRequests.execute(req.user!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/link-requests/:id/approve', async (req, res, next) => {
    try {
      const result = await container.approveLinkRequest.execute(req.user!, req.params.id, req.ip);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/link-requests/:id/reject', async (req, res, next) => {
    try {
      const result = await container.rejectLinkRequest.execute(req.user!, req.params.id, req.ip);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /** @deprecated Use POST /link-requests */
  router.post('/link', validateBody(linkPatientSchema), async (req, res, next) => {
    try {
      const patient = await container.linkPatientByCode.execute(req.user!, req.body.code);
      res.json(await toClientPatient(patient.props as unknown as Record<string, unknown>, storage));
    } catch (err) {
      next(err);
    }
  });

  router.get('/code/:code', async (req, res, next) => {
    try {
      const patient = await container.getPatientByCode.execute(req.user!, req.params.code);
      res.json(await toClientPatient(patient.props as unknown as Record<string, unknown>, storage));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/link', async (req, res, next) => {
    try {
      const patient = await container.unlinkPatient.execute(req.user!, req.params.id);
      res.json(await toClientPatient(patient.props as unknown as Record<string, unknown>, storage));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/members', async (req, res, next) => {
    try {
      const members = await container.listPatientMembers.execute(req.user!, req.params.id);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
      await container.revokePatientMember.execute(
        req.user!,
        req.params.id,
        req.params.userId,
        req.ip,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/barcode', async (req, res, next) => {
    try {
      const barcode = await container.getPatientBarcode.execute(req.user!, req.params.id);
      res.json(barcode);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const patient = await container.getPatient.execute(req.user!, req.params.id);
      res.json(await toClientPatient(patient.props as unknown as Record<string, unknown>, storage));
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', validateBody(updatePatientSchema), async (req, res, next) => {
    try {
      const patient = await container.updatePatient.execute(req.user!, req.params.id, req.body);
      res.json(await toClientPatient(patient.props as unknown as Record<string, unknown>, storage));
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await container.deletePatient.execute(req.user!, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/medical-records', validateBody(medicalRecordSchema), async (req, res, next) => {
    try {
      const record = await container.addMedicalRecord.execute(req.user!, req.params.id, req.body);
      res.status(201).json(record);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/medical-records', async (req, res, next) => {
    try {
      const records = await container.listMedicalRecords.execute(req.user!, req.params.id);
      res.json(records);
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/:id/medical-records/:recordId',
    validateBody(updateMedicalRecordSchema),
    async (req, res, next) => {
      try {
        const record = await container.updateMedicalRecord.execute(
          req.user!,
          req.params.id,
          req.params.recordId,
          req.body,
        );
        res.json(record);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/:id/medical-records/:recordId', async (req, res, next) => {
    try {
      await container.deleteMedicalRecord.execute(req.user!, req.params.id, req.params.recordId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/diet', validateBody(dietSchema), async (req, res, next) => {
    try {
      const feeding = await container.generateDiet.execute(req.user!, req.params.id, req.body);
      res.json(feeding);
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id/feeding', validateBody(feedingSchema), async (req, res, next) => {
    try {
      const feeding = await container.updateFeeding.execute(req.user!, req.params.id, req.body);
      res.json(feeding);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/feeding', async (req, res, next) => {
    try {
      const feeding = await container.getFeeding.execute(req.user!, req.params.id);
      res.json(feeding);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/feeding/summary', async (req, res, next) => {
    try {
      const summary = await container.getFeedingSummary.execute(req.user!, req.params.id, {
        from: typeof req.query.from === 'string' ? req.query.from : undefined,
        to: typeof req.query.to === 'string' ? req.query.to : undefined,
      });
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/feeding/logs', async (req, res, next) => {
    try {
      const logs = await container.listFeedingLogs.execute(req.user!, req.params.id, {
        from: typeof req.query.from === 'string' ? req.query.from : undefined,
        to: typeof req.query.to === 'string' ? req.query.to : undefined,
      });
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/feeding/logs', validateBody(feedingLogSchema), async (req, res, next) => {
    try {
      const log = await container.markFeedingLog.execute(req.user!, req.params.id, req.body);
      res.status(201).json(log);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/feeding/reminders/sync', async (req, res, next) => {
    try {
      const reminders = await container.syncFeedingReminders.execute(req.user!, req.params.id);
      res.json(reminders);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/reminders', validateBody(reminderSchema), async (req, res, next) => {
    try {
      const reminder = await container.addReminder.execute(req.user!, req.params.id, req.body);
      res.status(201).json(reminder);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/reminders', async (req, res, next) => {
    try {
      const reminders = await container.listReminders.execute(req.user!, req.params.id);
      res.json(reminders);
    } catch (err) {
      next(err);
    }
  });

  router.put('/reminders/:id', validateBody(updateReminderSchema), async (req, res, next) => {
    try {
      const reminder = await container.updateReminder.execute(req.user!, req.params.id, req.body);
      res.json(reminder);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reminders/:id/complete', async (req, res, next) => {
    try {
      const reminder = await container.completeReminder.execute(req.user!, req.params.id);
      res.json(reminder);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/reminders/:id', async (req, res, next) => {
    try {
      await container.deleteReminder.execute(req.user!, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
