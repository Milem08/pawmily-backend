import request from 'supertest';

jest.setTimeout(120000);
import { createApp } from '../../src/interfaces/http/createApp';
import { prisma } from '../../src/infrastructure/persistence/prisma/prismaClient';
import { addCalendarDays, localDateTimeToInstant, todayInBusinessZone } from '../../src/shared/businessTime';
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

function firstDose() {
  return {
    firstDoseDate: addCalendarDays(todayInBusinessZone(), 3),
    firstDoseTime: '08:00',
  };
}

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

describeDb('medicinas, consultas y prioridad alta', () => {
  const app = createApp();

  async function clinicWithOwner(vetName = 'Dra. López') {
    const vet = await register(app, {
      email: `${uid('vet')}@example.test`,
      role: 'vet',
      name: vetName,
    });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
    expect(vet.status).toBe(201);
    expect(owner.status).toBe(201);
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    expect(created.status).toBe(201);
    await linkOwner(app, owner.body, vet.body, created.body.code);
    return { vet, owner, patientId: created.body.id as string, code: created.body.code as string };
  }

  async function prescribe(
    vetToken: string,
    patientId: string,
    body: Record<string, unknown>,
  ) {
    const consult = await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vetToken))
      .send({ date: '2026-10-07', reason: 'Receta', ...body });
    expect(consult.status).toBe(201);
    return consult.body as { id: string; consultationNumber: string; vetName: string; time: string };
  }

  function schedule(token: string, patientId: string, recordId: string, extra: Record<string, unknown> = {}) {
    return request(app)
      .post(`/api/patients/${patientId}/medical-records/${recordId}/schedule-medication`)
      .set(bearer(token))
      .send({ ...firstDose(), ...extra });
  }

  async function doseInstants(patientId: string) {
    const rows = await prisma.reminder.findMany({
      where: { petId: patientId, category: 'medicamento' },
    });
    return rows
      .map((row) => ({
        completed: row.completed,
        at: localDateTimeToInstant(row.date, row.time || '00:00').getTime(),
      }))
      .sort((a, b) => a.at - b.at);
  }

  it('MED-01 3 veces al día por 5 días crea 15 tomas cada 8 h', async () => {
    const { vet, owner, patientId } = await clinicWithOwner();
    const record = await prescribe(vet.body.accessToken, patientId, {
      medication: 'Amoxicilina',
      typePayload: { medFrequency: '3 veces al día por 5 días' },
    });
    const scheduled = await schedule(owner.body.accessToken, patientId, record.id);
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.created).toBe(15);

    const doses = await doseInstants(patientId);
    expect(doses).toHaveLength(15);
    for (let i = 1; i < doses.length; i++) {
      expect(doses[i].at - doses[i - 1].at).toBe(8 * 60 * 60 * 1000);
    }
  });

  it('MED-03 48 h y 7 días crea 4 tomas', async () => {
    const { vet, owner, patientId } = await clinicWithOwner();
    const record = await prescribe(vet.body.accessToken, patientId, {
      medication: 'Ivermectina',
      typePayload: { medFrequency: 'según indicación' },
    });
    const scheduled = await schedule(owner.body.accessToken, patientId, record.id, {
      intervalHours: 48,
      durationDays: 7,
    });
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.created).toBe(4);
    const doses = await doseInstants(patientId);
    expect(doses).toHaveLength(4);
    for (let i = 1; i < doses.length; i++) {
      expect(doses[i].at - doses[i - 1].at).toBe(48 * 60 * 60 * 1000);
    }
  });

  it('MED-04 8 h y 30 días crea 90 tomas', async () => {
    const { vet, owner, patientId } = await clinicWithOwner();
    const record = await prescribe(vet.body.accessToken, patientId, {
      medication: 'Cefalexina',
      typePayload: { medFrequency: 'según indicación' },
    });
    const scheduled = await schedule(owner.body.accessToken, patientId, record.id, {
      intervalHours: 8,
      durationDays: 30,
    });
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.created).toBe(90);
    expect(await prisma.reminder.count({ where: { petId: patientId, category: 'medicamento' } })).toBe(90);
  });

  it('MED-02 programar dos veces deja una sola tanda de tomas pendientes', async () => {
    const { vet, owner, patientId } = await clinicWithOwner();
    const record = await prescribe(vet.body.accessToken, patientId, {
      medication: 'Amoxicilina',
      typePayload: { medFrequency: '3 veces al día por 5 días' },
    });
    const first = await schedule(owner.body.accessToken, patientId, record.id);
    const second = await schedule(owner.body.accessToken, patientId, record.id);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await prisma.reminder.count({ where: { petId: patientId, category: 'medicamento', completed: false } })).toBe(15);

    const pending = await prisma.reminder.findFirst({
      where: { petId: patientId, category: 'medicamento', completed: false },
    });
    const completed = await request(app)
      .post(`/api/patients/reminders/${pending!.id}/complete`)
      .set(bearer(owner.body.accessToken));
    expect(completed.status).toBe(200);

    const third = await schedule(owner.body.accessToken, patientId, record.id);
    expect(third.status).toBe(201);
    expect(await prisma.reminder.count({ where: { petId: patientId, category: 'medicamento', completed: false } })).toBe(15);
    expect(await prisma.reminder.count({ where: { petId: patientId, category: 'medicamento', completed: true } })).toBe(1);

    const other = await prescribe(vet.body.accessToken, patientId, {
      medication: 'Otra',
      typePayload: { medFrequency: 'cada 12 h por 1 día' },
    });
    const [left, right] = await Promise.all([
      schedule(owner.body.accessToken, patientId, other.id, { intervalHours: 12, durationDays: 1 }),
      schedule(owner.body.accessToken, patientId, other.id, { intervalHours: 12, durationDays: 1 }),
    ]);
    expect([left.status, right.status].sort()).toEqual([201, 201]);
    expect(
      await prisma.reminder.count({
        where: {
          petId: patientId,
          category: 'medicamento',
          completed: false,
          description: { contains: other.consultationNumber },
        },
      }),
    ).toBe(2);
  });

  it('MED-05 un cuidador no programa tomas', async () => {
    const { vet, owner, patientId, code } = await clinicWithOwner();
    const caregiver = await register(app, { email: `${uid('care')}@example.test`, role: 'owner' });
    const linked = await linkMember(app, owner.body, caregiver.body, code, 'CAREGIVER');
    expect(linked.status).toBe(200);
    const record = await prescribe(vet.body.accessToken, patientId, {
      medication: 'Amoxicilina',
      typePayload: { medFrequency: 'cada 8 horas por 5 días' },
    });
    const scheduled = await schedule(caregiver.body.accessToken, patientId, record.id);
    expect(scheduled.status).toBe(403);
    expect(await prisma.reminder.count({ where: { petId: patientId, category: 'medicamento' } })).toBe(0);
  });

  it('MR-01 crea la secuencia si falta y la siguiente consulta es consecutiva', async () => {
    const { vet, patientId } = await clinicWithOwner();
    await prisma.$executeRawUnsafe('DROP SEQUENCE IF EXISTS consultation_number_seq');
    const first = await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken))
      .send({ date: '2026-10-07', reason: 'Uno', vetName: 'Dra. López' });
    const second = await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken))
      .send({ date: '2026-10-07', reason: 'Dos', vetName: 'Dra. López' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstNumber = Number(String(first.body.consultationNumber).replace(/\D/g, ''));
    const secondNumber = Number(String(second.body.consultationNumber).replace(/\D/g, ''));
    expect(secondNumber).toBe(firstNumber + 1);
  });

  it('MR-02 con el reloj en 2026-10-06T20:38Z la hora es 14:38', async () => {
    const { vet, patientId } = await clinicWithOwner();
    jest.useFakeTimers({
      now: new Date('2026-10-06T20:38:00.000Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setInterval',
        'setTimeout',
        'queueMicrotask',
        'clearTimeout',
        'clearInterval',
      ],
    });
    try {
      const consult = await request(app)
        .post(`/api/patients/${patientId}/medical-records`)
        .set(bearer(vet.body.accessToken))
        .send({ date: '2026-10-06', reason: 'Control', vetName: 'Dra. López' });
      expect(consult.status).toBe(201);
      expect(consult.body.time).toBe('14:38');
    } finally {
      jest.useRealTimers();
    }
  });

  it('MR-03 vetName es el nombre del veterinario, también si quedó guardado el id', async () => {
    const { vet, patientId } = await clinicWithOwner('Dra. López');
    const consult = await request(app)
      .post(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken))
      .send({ date: '2026-10-07', reason: 'Control' });
    expect(consult.status).toBe(201);
    expect(consult.body.vetName).toBe('Dra. López');

    await prisma.medicalRecord.update({
      where: { id: consult.body.id },
      data: { vetName: vet.body.user.id },
    });
    const listed = await request(app)
      .get(`/api/patients/${patientId}/medical-records`)
      .set(bearer(vet.body.accessToken));
    expect(listed.status).toBe(200);
    expect(listed.body.find((row: { id: string }) => row.id === consult.body.id).vetName).toBe('Dra. López');
  });

  it('REM-01 el cuarto recordatorio de prioridad alta responde 409', async () => {
    const { owner, patientId } = await clinicWithOwner();
    for (let i = 1; i <= 3; i++) {
      const created = await request(app)
        .post(`/api/patients/${patientId}/reminders`)
        .set(bearer(owner.body.accessToken))
        .send({ title: `Alta ${i}`, date: '2027-04-01', priority: 'alta' });
      expect(created.status).toBe(201);
    }
    const fourth = await request(app)
      .post(`/api/patients/${patientId}/reminders`)
      .set(bearer(owner.body.accessToken))
      .send({ title: 'Alta 4', date: '2027-04-02', priority: 'alta' });
    expect(fourth.status).toBe(409);
    expect(fourth.body.message).toBe('Ya hay 3 recordatorios prioritarios para esta mascota');
  });
});
