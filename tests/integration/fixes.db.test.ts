import request from 'supertest';

jest.setTimeout(120000);
import { createApp } from '../../src/interfaces/http/createApp';
import { EmailSender } from '../../src/infrastructure/email/EmailSender';
import { prisma } from '../../src/infrastructure/persistence/prisma/prismaClient';
import { testDatabaseConfigured } from './support';

const describeDb = testDatabaseConfigured() ? describe : describe.skip;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function register(
  app: ReturnType<typeof createApp>,
  input: { email?: string; phone?: string; password?: string; name?: string; role?: string },
) {
  return request(app)
    .post('/api/auth/register')
    .send({
      email: input.email,
      phone: input.phone,
      password: input.password ?? 'secreto1',
      name: input.name ?? 'Persona',
      role: input.role,
    });
}

const patientBody = {
  name: 'Firulais',
  species: 'Perro',
  breed: 'Mestizo',
  age: '3',
  sex: 'M',
  ownerName: 'Ana',
};

describeDb('integración contra la base de datos de prueba', () => {
  const app = createApp();
  let failMidDelete = false;

  beforeAll(() => {
    (
      prisma as unknown as {
        $use: (
          fn: (
            params: { model?: string; action: string },
            next: (params: unknown) => Promise<unknown>,
          ) => Promise<unknown>,
        ) => void;
      }
    ).$use(async (params, next) => {
      if (failMidDelete && params.model === 'Reminder' && params.action === 'deleteMany') {
        throw new Error('SIMULATED_DELETE_FAILURE');
      }
      return next(params);
    });
  });

  afterEach(() => {
    failMidDelete = false;
  });

  it('AUTH-01 registro sin role queda owner, vet explícito sigue y un role desconocido es 400', async () => {
    const plain = await register(app, { email: `${uid('plain')}@example.test` });
    expect(plain.status).toBe(201);
    expect(plain.body.user.role).toBe('owner');

    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    expect(vet.status).toBe(201);
    expect(vet.body.user.role).toBe('vet');

    const unknown = await register(app, { email: `${uid('bad')}@example.test`, role: 'xyz' });
    expect(unknown.status).toBe(400);
  });

  it('email duplicado es 409 y la contraseña incorrecta es 401', async () => {
    const email = `${uid('dup')}@example.test`;
    const created = await register(app, { email, password: 'secreto1' });
    expect(created.status).toBe(201);
    const again = await register(app, { email, password: 'secreto1' });
    expect(again.status).toBe(409);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'otra-clave' });
    expect(login.status).toBe(401);
  });

  it('AUTH-05 dos refresh simultáneos con el mismo token dan 200 y 401', async () => {
    const created = await register(app, { email: `${uid('refresh')}@example.test`, role: 'owner' });
    expect(created.status).toBe(201);
    const token = created.body.refreshToken as string;
    const [first, second] = await Promise.all([
      request(app).post('/api/auth/refresh').send({ refreshToken: token }),
      request(app).post('/api/auth/refresh').send({ refreshToken: token }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 401]);
  });

  it('reutilizar un refresh token ya usado responde 401', async () => {
    const created = await register(app, { email: `${uid('once')}@example.test`, role: 'owner' });
    const token = created.body.refreshToken as string;
    const first = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/refresh').send({ refreshToken: token });
    expect(second.status).toBe(401);
  });

  it('AUTH-07/08 cambiar contraseña exige la actual y revoca el refresh anterior', async () => {
    const email = `${uid('pwd')}@example.test`;
    const created = await register(app, { email, password: 'secreto1', role: 'owner' });
    const access = created.body.accessToken as string;
    const refresh = created.body.refreshToken as string;

    const missing = await request(app)
      .put('/api/auth/profile')
      .set(bearer(access))
      .send({ password: 'secreto2' });
    expect(missing.status).toBe(400);

    const wrong = await request(app)
      .put('/api/auth/profile')
      .set(bearer(access))
      .send({ password: 'secreto2', currentPassword: 'no-es' });
    expect([401, 403]).toContain(wrong.status);

    const ok = await request(app)
      .put('/api/auth/profile')
      .set(bearer(access))
      .send({ password: 'secreto2', currentPassword: 'secreto1' });
    expect(ok.status).toBe(200);

    const reused = await request(app).post('/api/auth/refresh').send({ refreshToken: refresh });
    expect(reused.status).toBe(401);
  });

  it('AUTH-09 no acepta el teléfono de otro usuario aunque cambie el formato', async () => {
    const first = await register(app, {
      email: `${uid('phone-a')}@example.test`,
      phone: '+50370000000',
      role: 'owner',
    });
    expect(first.status).toBe(201);
    const second = await register(app, {
      email: `${uid('phone-b')}@example.test`,
      role: 'owner',
    });
    expect(second.status).toBe(201);
    const conflict = await request(app)
      .put('/api/auth/profile')
      .set(bearer(second.body.accessToken))
      .send({ phone: '+503 7000-0000' });
    expect(conflict.status).toBe(409);
  });

  it('AUTHZ-10 el dueño, co-dueño y cuidador no ven privateNotes; el vet sí', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
    const coOwner = await register(app, { email: `${uid('co')}@example.test`, role: 'owner' });
    const caregiver = await register(app, { email: `${uid('care')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    expect(created.status).toBe(201);
    const patientId = created.body.id as string;
    const code = created.body.code as string;

    const consult = await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken))
      .send({
        date: '2026-10-07',
        reason: 'Control',
        type: 'GENERAL',
        medication: 'Amoxicilina',
        privateNotes: 'SECRETO-QA',
        physicalExam: 'interno-qa',
        vetName: 'Dra',
      });
    expect(consult.status).toBe(201);

    await linkOwner(app, owner.body, vet.body, code);
    await linkMember(app, owner.body, coOwner.body, code, 'CO_OWNER');
    await linkMember(app, owner.body, caregiver.body, code, 'CAREGIVER');

    for (const account of [owner.body, coOwner.body, caregiver.body]) {
      const byId = await request(app)
        .get(`/api/patients/${patientId}`)
        .set(bearer(account.accessToken));
      const mine = await request(app).get('/api/patients/mine').set(bearer(account.accessToken));
      expect(byId.status).toBe(200);
      expect(mine.status).toBe(200);
      expect(JSON.stringify(byId.body)).not.toContain('SECRETO-QA');
      expect(JSON.stringify(mine.body)).not.toContain('SECRETO-QA');
      expect(JSON.stringify(byId.body)).not.toContain('interno-qa');
    }

    const vetView = await request(app)
      .get(`/api/patients/${patientId}`)
      .set(bearer(vet.body.accessToken));
    expect(vetView.status).toBe(200);
    expect(JSON.stringify(vetView.body)).toContain('SECRETO-QA');
  });

  it('INT-06 el dueño ve medication de una consulta GENERAL', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, name: 'Luna' });
    const patientId = created.body.id as string;
    await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken))
      .send({
        date: '2026-10-07',
        reason: 'Control',
        type: 'GENERAL',
        medication: 'Amoxicilina',
        privateNotes: 'SECRETO-QA',
        vetName: 'Dra',
      });
    await linkOwner(app, owner.body, vet.body, created.body.code);
    const records = await request(app)
      .get(`/api/patients/${patientId}/medical-records`)
      .set(bearer(owner.body.accessToken));
    expect(records.status).toBe(200);
    expect(JSON.stringify(records.body)).toContain('Amoxicilina');
    expect(JSON.stringify(records.body)).not.toContain('SECRETO-QA');
  });

  it('BAR-01 solo el vet envía el código de barras al correo configurado', async () => {
    const previous = process.env.BARCODE_NOTIFY_EMAIL;
    process.env.BARCODE_NOTIFY_EMAIL = 'impresora@example.test';
    const send = jest.spyOn(EmailSender.prototype, 'send').mockResolvedValue({ delivered: true });
    try {
      const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
      const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
      const caregiver = await register(app, { email: `${uid('care')}@example.test`, role: 'owner' });
      const created = await request(app)
        .post('/api/patients')
        .set(bearer(vet.body.accessToken))
        .send(patientBody);
      const patientId = created.body.id as string;
      await linkOwner(app, owner.body, vet.body, created.body.code);
      await linkMember(app, owner.body, caregiver.body, created.body.code, 'CAREGIVER');
      const imageBase64 = Buffer.from('barcode-image-bytes-for-the-printer').toString('base64');

      const asOwner = await request(app)
        .post(`/api/patients/${patientId}/barcode-email`)
        .set(bearer(owner.body.accessToken))
        .send({ imageBase64 });
      const asCaregiver = await request(app)
        .post(`/api/patients/${patientId}/barcode-email`)
        .set(bearer(caregiver.body.accessToken))
        .send({ imageBase64 });
      expect(asOwner.status).toBe(403);
      expect(asCaregiver.status).toBe(403);

      const asVet = await request(app)
        .post(`/api/patients/${patientId}/barcode-email`)
        .set(bearer(vet.body.accessToken))
        .send({ imageBase64 });
      expect(asVet.status).toBe(200);
      expect(send).toHaveBeenCalledWith(
        'impresora@example.test',
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );

      delete process.env.BARCODE_NOTIFY_EMAIL;
      const missing = await request(app)
        .post(`/api/patients/${patientId}/barcode-email`)
        .set(bearer(vet.body.accessToken))
        .send({ imageBase64 });
      expect(missing.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(missing.body)).toContain('Correo de impresión no configurado');
    } finally {
      send.mockRestore();
      if (previous === undefined) delete process.env.BARCODE_NOTIFY_EMAIL;
      else process.env.BARCODE_NOTIFY_EMAIL = previous;
    }
  });

  it('BE-24 page y limit inválidos no producen 500', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const inbox = await request(app)
      .get('/api/inbox?limit=abc')
      .set(bearer(vet.body.accessToken));
    expect(inbox.status).not.toBe(500);
    expect([200, 400]).toContain(inbox.status);

    const page = await request(app)
      .get('/api/patients?page=-1&limit=abc')
      .set(bearer(vet.body.accessToken));
    expect(page.status).toBe(200);
    expect(page.body.meta.page).toBe(1);
    expect(page.body.meta.limit).toBe(20);
  });

  it('AUTHZ-20 no se puede marcar favorita una cita de otra clínica', async () => {
    const vetA = await register(app, { email: `${uid('vet-a')}@example.test`, role: 'vet' });
    const vetB = await register(app, { email: `${uid('vet-b')}@example.test`, role: 'vet' });
    const appointment = await request(app)
      .post('/api/appointments')
      .set(bearer(vetA.body.accessToken))
      .send({ petName: 'Luna', ownerName: 'Ana', date: '2026-10-08', time: '09:00' });
    expect(appointment.status).toBe(201);
    const favorite = await request(app)
      .post('/api/favorites')
      .set(bearer(vetB.body.accessToken))
      .send({ targetType: 'APPOINTMENT', targetId: appointment.body.id });
    expect(favorite.status).toBe(404);
  });

  it('AUTHZ-06 un código existente sin acceso y uno inexistente responden igual', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const stranger = await register(app, { email: `${uid('str')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    const hidden = await request(app)
      .get(`/api/patients/code/${created.body.code}`)
      .set(bearer(stranger.body.accessToken));
    const missing = await request(app)
      .get('/api/patients/code/PAW-ZZZZZZZ')
      .set(bearer(stranger.body.accessToken));
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
  });

  it('BE-27 dos aprobaciones de dueño a la vez dejan un solo dueño', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const ownerA = await register(app, { email: `${uid('own-a')}@example.test`, role: 'owner' });
    const ownerB = await register(app, { email: `${uid('own-b')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, name: 'Nube' });
    const code = created.body.code as string;
    const requestA = await request(app)
      .post('/api/patients/link-requests')
      .set(bearer(ownerA.body.accessToken))
      .send({ code });
    const requestB = await request(app)
      .post('/api/patients/link-requests')
      .set(bearer(ownerB.body.accessToken))
      .send({ code });
    expect(requestA.status).toBe(201);
    expect(requestB.status).toBe(201);
    const [approvedA, approvedB] = await Promise.all([
      request(app)
        .post(`/api/patients/link-requests/${requestA.body.id}/approve`)
        .set(bearer(vet.body.accessToken)),
      request(app)
        .post(`/api/patients/link-requests/${requestB.body.id}/approve`)
        .set(bearer(vet.body.accessToken)),
    ]);
    expect([approvedA.status, approvedB.status].sort()).toEqual([200, 409]);
    const owners = await prisma.patientAccess.count({
      where: {
        patientId: created.body.id,
        role: 'OWNER',
        status: 'ACTIVE',
        revokedAt: null,
      },
    });
    const patient = await prisma.patient.findUnique({ where: { id: created.body.id } });
    expect(owners).toBe(1);
    expect(patient?.ownerUserId).toBeTruthy();
  });

  it('BE-33 un fallo a mitad del borrado no deja el paciente a medias', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, name: 'Kira' });
    const patientId = created.body.id as string;
    const consult = await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken))
      .send({ date: '2026-10-07', reason: 'Control', vetName: 'Dra' });
    expect(consult.status).toBe(201);
    const reminder = await request(app)
      .post(`/api/patients/${patientId}/reminders`)
      .set(bearer(vet.body.accessToken))
      .send({ title: 'Vacuna', date: '2026-10-20' });
    expect(reminder.status).toBe(201);

    failMidDelete = true;
    const removed = await request(app)
      .delete(`/api/patients/${patientId}`)
      .set(bearer(vet.body.accessToken));
    failMidDelete = false;
    expect(removed.status).not.toBe(204);

    const stillThere = await request(app)
      .get(`/api/patients/${patientId}`)
      .set(bearer(vet.body.accessToken));
    expect(stillThere.status).toBe(200);
    const records = await prisma.medicalRecord.count({ where: { petId: patientId } });
    const reminders = await prisma.reminder.count({ where: { petId: patientId } });
    expect(records).toBe(1);
    expect(reminders).toBe(1);
  });

  it('un vet de otra clínica no lee, edita ni borra un paciente ajeno', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const other = await register(app, { email: `${uid('other')}@example.test`, role: 'vet' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    const patientId = created.body.id as string;
    const read = await request(app).get(`/api/patients/${patientId}`).set(bearer(other.body.accessToken));
    const edit = await request(app)
      .put(`/api/patients/${patientId}`)
      .set(bearer(other.body.accessToken))
      .send({ name: 'Otro' });
    const remove = await request(app)
      .delete(`/api/patients/${patientId}`)
      .set(bearer(other.body.accessToken));
    expect([403, 404]).toContain(read.status);
    expect([403, 404]).toContain(edit.status);
    expect([403, 404]).toContain(remove.status);
  });

  it('un dueño ajeno no lee el paciente ni su plan', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const stranger = await register(app, { email: `${uid('str')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    const patientId = created.body.id as string;
    const read = await request(app)
      .get(`/api/patients/${patientId}`)
      .set(bearer(stranger.body.accessToken));
    const plan = await request(app)
      .get(`/api/patients/${patientId}/feeding`)
      .set(bearer(stranger.body.accessToken));
    expect(read.status).toBe(403);
    expect(plan.status).toBe(403);
  });

  it('un vet ajeno no añade una consulta', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const other = await register(app, { email: `${uid('other')}@example.test`, role: 'vet' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    const consult = await request(app)
      .post(`/api/patients/${created.body.id}/medical-records`)
      .set(bearer(other.body.accessToken))
      .send({ date: '2026-10-07', reason: 'Control', vetName: 'Dra' });
    expect(consult.status).toBe(403);
  });

  it('el flujo de vínculos deja la mascota en /patients/mine', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
    const coOwner = await register(app, { email: `${uid('co')}@example.test`, role: 'owner' });
    const caregiver = await register(app, { email: `${uid('care')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, name: 'Milo' });
    const code = created.body.code as string;
    const lookup = await request(app)
      .get(`/api/patients/link-lookup/${code}`)
      .set(bearer(owner.body.accessToken));
    expect(lookup.status).toBe(200);
    expect(Object.keys(lookup.body).sort()).toEqual(
      ['clinicHint', 'code', 'hasOwner', 'id', 'name', 'species'].sort(),
    );

    const pending = await request(app)
      .post('/api/patients/link-requests')
      .set(bearer(owner.body.accessToken))
      .send({ code });
    expect(pending.status).toBe(201);
    expect(pending.body.status).toBe('PENDING');

    const approved = await request(app)
      .post(`/api/patients/link-requests/${pending.body.id}/approve`)
      .set(bearer(vet.body.accessToken));
    expect(approved.status).toBe(200);

    const mine = await request(app).get('/api/patients/mine').set(bearer(owner.body.accessToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.some((item: { id: string }) => item.id === created.body.id)).toBe(true);

    const co = await linkMember(app, owner.body, coOwner.body, code, 'CO_OWNER');
    const care = await linkMember(app, owner.body, caregiver.body, code, 'CAREGIVER');
    expect(co.status).toBe(200);
    expect(care.status).toBe(200);
  });

  it('un cuidador no edita el paciente y un dueño no lo crea', async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
    const caregiver = await register(app, { email: `${uid('care')}@example.test`, role: 'owner' });
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    await linkOwner(app, owner.body, vet.body, created.body.code);
    await linkMember(app, owner.body, caregiver.body, created.body.code, 'CAREGIVER');
    const edit = await request(app)
      .put(`/api/patients/${created.body.id}`)
      .set(bearer(caregiver.body.accessToken))
      .send({ weight: '4' });
    expect(edit.status).toBe(403);
    const create = await request(app)
      .post('/api/patients')
      .set(bearer(owner.body.accessToken))
      .send(patientBody);
    expect(create.status).toBe(403);
  });
});

async function linkOwner(
  app: ReturnType<typeof createApp>,
  owner: { accessToken: string },
  vet: { accessToken: string },
  code: string,
) {
  const pending = await request(app)
    .post('/api/patients/link-requests')
    .set(bearer(owner.accessToken))
    .send({ code });
  expect(pending.status).toBe(201);
  const approved = await request(app)
    .post(`/api/patients/link-requests/${pending.body.id}/approve`)
    .set(bearer(vet.accessToken));
  expect(approved.status).toBe(200);
}

async function linkMember(
  app: ReturnType<typeof createApp>,
  owner: { accessToken: string },
  member: { accessToken: string },
  code: string,
  requestedRole: 'CO_OWNER' | 'CAREGIVER',
) {
  const pending = await request(app)
    .post('/api/patients/link-requests')
    .set(bearer(member.accessToken))
    .send({ code, requestedRole });
  expect(pending.status).toBe(201);
  return request(app)
    .post(`/api/patients/link-requests/${pending.body.id}/approve`)
    .set(bearer(owner.accessToken));
}
