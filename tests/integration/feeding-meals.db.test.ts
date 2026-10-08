import request from 'supertest';

jest.setTimeout(120000);
import { createApp } from '../../src/interfaces/http/createApp';
import { prisma } from '../../src/infrastructure/persistence/prisma/prismaClient';
import { addCalendarDays, todayInBusinessZone } from '../../src/shared/businessTime';
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

function planBody(
  meals: Array<{ id?: string; label: string; time: string }>,
  extra: Record<string, unknown> = {},
) {
  return {
    recommendedAmount: '200 g',
    mealsPerDay: meals.length,
    meals: meals.map((meal, index) => ({
      sortOrder: index,
      amount: '50 g',
      ...meal,
    })),
    ...extra,
  };
}

describeDb('comidas, historial y dieta', () => {
  const app = createApp();

  async function clinicWithOwner() {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet' });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner' });
    expect(vet.status).toBe(201);
    expect(owner.status).toBe(201);
    const created = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    expect(created.status).toBe(201);
    await linkOwner(app, owner.body, vet.body, created.body.code);
    return { vet, owner, patientId: created.body.id as string };
  }

  function putPlan(token: string, patientId: string, body: Record<string, unknown>) {
    return request(app).put(`/api/patients/${patientId}/feeding`).set(bearer(token)).send(body);
  }

  function logMeal(
    token: string,
    patientId: string,
    body: { mealId: string; scheduledDate: string; status: string },
  ) {
    return request(app).post(`/api/patients/${patientId}/feeding/logs`).set(bearer(token)).send(body);
  }

  async function history(token: string, patientId: string, day: string) {
    const res = await request(app)
      .get(`/api/patients/${patientId}/feeding/logs`)
      .query({ from: day, to: day })
      .set(bearer(token));
    expect(res.status).toBe(200);
    return res.body as Array<{
      mealId: string;
      status: string;
      scheduledDate: string;
      meal: { label: string };
    }>;
  }

  it('el vet define el plan y el dueño no puede cambiarlo ni calcular la dieta', async () => {
    const { vet, owner, patientId } = await clinicWithOwner();
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([{ label: 'Desayuno', time: '08:00' }], { startDate: todayInBusinessZone() }),
    );
    expect(plan.status).toBe(200);

    const ownerPlan = await putPlan(
      owner.body.accessToken,
      patientId,
      planBody([{ label: 'Desayuno', time: '09:00' }]),
    );
    expect(ownerPlan.status).toBe(403);

    const ownerDiet = await request(app)
      .post(`/api/patients/${patientId}/diet`)
      .set(bearer(owner.body.accessToken))
      .send({ weightKg: 10 });
    expect(ownerDiet.status).toBe(403);
  });

  it('FEED-06 quitar el desayuno no reescribe ni borra el historial', async () => {
    const today = todayInBusinessZone();
    const yesterday = addCalendarDays(today, -1);
    const { vet, owner, patientId } = await clinicWithOwner();
    const created = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { label: 'Desayuno', time: '08:00' },
          { label: 'Almuerzo', time: '13:00' },
          { label: 'Cena', time: '19:00' },
        ],
        { startDate: yesterday },
      ),
    );
    expect(created.status).toBe(200);
    const breakfast = created.body.meals.find((meal: { label: string }) => meal.label === 'Desayuno');
    const lunch = created.body.meals.find((meal: { label: string }) => meal.label === 'Almuerzo');
    const dinner = created.body.meals.find((meal: { label: string }) => meal.label === 'Cena');

    const eaten = await logMeal(owner.body.accessToken, patientId, {
      mealId: breakfast.id,
      scheduledDate: yesterday,
      status: 'EATEN',
    });
    const partial = await logMeal(owner.body.accessToken, patientId, {
      mealId: dinner.id,
      scheduledDate: yesterday,
      status: 'PARTIAL',
    });
    expect(eaten.status).toBe(201);
    expect(partial.status).toBe(201);

    const updated = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { id: lunch.id, label: 'Almuerzo', time: '13:00' },
          { id: dinner.id, label: 'Cena', time: '19:00' },
        ],
        { startDate: yesterday },
      ),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.meals.map((meal: { label: string }) => meal.label)).toEqual(['Almuerzo', 'Cena']);

    const logs = await history(vet.body.accessToken, patientId, yesterday);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mealId: breakfast.id, status: 'EATEN', meal: expect.objectContaining({ label: 'Desayuno' }) }),
        expect.objectContaining({ mealId: dinner.id, status: 'PARTIAL', meal: expect.objectContaining({ label: 'Cena' }) }),
      ]),
    );
    expect(logs).toHaveLength(2);

    const kept = await prisma.feedingMeal.findUnique({ where: { id: breakfast.id } });
    expect(kept?.archivedAt).toBeTruthy();
    expect(kept?.label).toBe('Desayuno');

    const reminders = await request(app)
      .get(`/api/patients/${patientId}/reminders`)
      .set(bearer(owner.body.accessToken));
    expect(reminders.status).toBe(200);
    const titles = (reminders.body as Array<{ title?: string }>).map((row) => row.title ?? '');
    expect(titles.some((title) => title.includes('Desayuno'))).toBe(false);
    expect(titles.some((title) => title.includes('Cena'))).toBe(true);
  });

  it('FEED-06 un cliente sin id empareja por nombre y hora', async () => {
    const today = todayInBusinessZone();
    const yesterday = addCalendarDays(today, -1);
    const { vet, owner, patientId } = await clinicWithOwner();
    const created = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { label: 'Desayuno', time: '08:00' },
          { label: 'Almuerzo', time: '13:00' },
          { label: 'Cena', time: '19:00' },
        ],
        { startDate: yesterday },
      ),
    );
    const breakfast = created.body.meals.find((meal: { label: string }) => meal.label === 'Desayuno');
    const dinner = created.body.meals.find((meal: { label: string }) => meal.label === 'Cena');
    expect(
      (
        await logMeal(owner.body.accessToken, patientId, {
          mealId: breakfast.id,
          scheduledDate: yesterday,
          status: 'EATEN',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await logMeal(owner.body.accessToken, patientId, {
          mealId: dinner.id,
          scheduledDate: yesterday,
          status: 'PARTIAL',
        })
      ).status,
    ).toBe(201);

    const updated = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { label: 'Almuerzo', time: '13:00' },
          { label: 'Cena', time: '19:00' },
        ],
        { startDate: yesterday },
      ),
    );
    expect(updated.status).toBe(200);
    expect(updated.body.meals.map((meal: { id: string }) => meal.id)).toContain(dinner.id);
    expect(updated.body.meals.map((meal: { label: string }) => meal.label)).not.toContain('Desayuno');

    const logs = await history(owner.body.accessToken, patientId, yesterday);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mealId: breakfast.id, status: 'EATEN', meal: expect.objectContaining({ label: 'Desayuno' }) }),
        expect.objectContaining({ mealId: dinner.id, status: 'PARTIAL', meal: expect.objectContaining({ label: 'Cena' }) }),
      ]),
    );
  });

  it('FEED-04, FEED-05 y una comida de otro paciente no se registran', async () => {
    const today = todayInBusinessZone();
    const yesterday = addCalendarDays(today, -1);
    const older = addCalendarDays(today, -10);
    const { vet, owner, patientId } = await clinicWithOwner();
    const other = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, name: 'Luna' });
    expect(other.status).toBe(201);
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([{ label: 'Desayuno', time: '08:00' }], { startDate: today }),
    );
    const mealId = plan.body.meals[0].id as string;

    const future = await logMeal(owner.body.accessToken, patientId, {
      mealId,
      scheduledDate: '2099-01-01',
      status: 'EATEN',
    });
    expect(future.status).toBe(400);
    expect(future.body.message).toMatch(/futura/i);

    const past = await logMeal(owner.body.accessToken, patientId, {
      mealId,
      scheduledDate: yesterday,
      status: 'EATEN',
    });
    expect(past.status).toBe(400);
    expect(past.body.message).toMatch(/anterior al inicio/i);

    const beforeStart = await logMeal(owner.body.accessToken, patientId, {
      mealId,
      scheduledDate: older,
      status: 'EATEN',
    });
    expect(beforeStart.status).toBe(400);

    const foreignMeal = await logMeal(vet.body.accessToken, other.body.id, {
      mealId,
      scheduledDate: today,
      status: 'EATEN',
    });
    expect([400, 404]).toContain(foreignMeal.status);

    const stranger = await register(app, { email: `${uid('vet2')}@example.test`, role: 'vet' });
    const denied = await logMeal(stranger.body.accessToken, patientId, {
      mealId,
      scheduledDate: today,
      status: 'EATEN',
    });
    expect(denied.status).toBe(403);
  });

  it('el dueño registra el desayuno de ayer cuando el plan ya había empezado', async () => {
    const yesterday = addCalendarDays(todayInBusinessZone(), -1);
    const { vet, owner, patientId } = await clinicWithOwner();
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([{ label: 'Desayuno', time: '08:00' }], { startDate: yesterday }),
    );
    const logged = await logMeal(owner.body.accessToken, patientId, {
      mealId: plan.body.meals[0].id,
      scheduledDate: yesterday,
      status: 'EATEN',
    });
    expect(logged.status).toBe(201);
  });

  it('INT-03 guarda 8 pm como 20:00 y rechaza una hora ilegible', async () => {
    const { vet, patientId } = await clinicWithOwner();
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([{ label: 'Cena', time: '8 pm' }], { startDate: todayInBusinessZone() }),
    );
    expect(plan.status).toBe(200);
    expect(plan.body.meals[0].time).toBe('20:00');

    const bad = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([{ label: 'Cena', time: 'xx' }], { startDate: todayInBusinessZone() }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/no reconocida/i);
  });

  it('FEED-07 y FEED-08 el resumen no cuenta días fuera del plan ni un rango futuro', async () => {
    const today = todayInBusinessZone();
    const { vet, patientId } = await clinicWithOwner();
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { label: 'Desayuno', time: '08:00' },
          { label: 'Almuerzo', time: '13:00' },
          { label: 'Cena', time: '19:00' },
        ],
        { startDate: today },
      ),
    );
    expect(plan.status).toBe(200);

    const sinceStart = await request(app)
      .get(`/api/patients/${patientId}/feeding/summary`)
      .query({ from: addCalendarDays(today, -30), to: today })
      .set(bearer(vet.body.accessToken));
    expect(sinceStart.status).toBe(200);
    expect(sinceStart.body.compliance.scheduled).toBeLessThanOrEqual(3);

    const futureFrom = addCalendarDays(today, 10);
    const future = await request(app)
      .get(`/api/patients/${patientId}/feeding/summary`)
      .query({ from: futureFrom, to: addCalendarDays(today, 16) })
      .set(bearer(vet.body.accessToken));
    expect(future.status).toBe(200);
    expect(future.body.compliance.percent).toBeNull();
    expect(future.body.compliance.unlogged).toBe(0);
  });

  it('DIET-02, DIET-03 y un caballo responden 400', async () => {
    const { vet, patientId } = await clinicWithOwner();
    const huge = await request(app)
      .post(`/api/patients/${patientId}/diet`)
      .set(bearer(vet.body.accessToken))
      .send({ weightKg: 4000, mealsPerDay: 500, activityFactor: 50 });
    expect(huge.status).toBe(400);

    const mismatch = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { label: 'Desayuno', time: '08:00' },
          { label: 'Cena', time: '19:00' },
        ],
        { mealsPerDay: 500 },
      ),
    );
    expect(mismatch.status).toBe(400);

    const horse = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, name: 'Relámpago', species: 'Caballo', breed: 'Criollo' });
    expect(horse.status).toBe(201);
    const diet = await request(app)
      .post(`/api/patients/${horse.body.id}/diet`)
      .set(bearer(vet.body.accessToken))
      .send({ weightKg: 80, mealsPerDay: 2 });
    expect(diet.status).toBe(400);
    expect(diet.body.message).toMatch(/no soportada/i);
  });

  it('la dieta usa el número de comidas activas y un valor distinto responde 400', async () => {
    const { vet, patientId } = await clinicWithOwner();
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([
        { label: 'Desayuno', time: '08:00' },
        { label: 'Almuerzo', time: '13:00' },
        { label: 'Cena', time: '19:00' },
      ]),
    );
    expect(plan.status).toBe(200);

    const generated = await request(app)
      .post(`/api/patients/${patientId}/diet`)
      .set(bearer(vet.body.accessToken))
      .send({ weightKg: 10 });
    expect(generated.status).toBe(200);
    expect(generated.body.mealsPerDay).toBe(3);
    expect(generated.body.meals).toHaveLength(3);

    const current = await request(app)
      .get(`/api/patients/${patientId}/feeding`)
      .set(bearer(vet.body.accessToken));
    const savedAgain = await putPlan(vet.body.accessToken, patientId, {
      recommendedAmount: current.body.recommendedAmount,
      mealsPerDay: current.body.mealsPerDay,
      meals: current.body.meals.map(
        (meal: { id: string; label: string; time: string; amount?: string; sortOrder?: number }) => ({
          id: meal.id,
          label: meal.label,
          time: meal.time,
          amount: meal.amount,
          sortOrder: meal.sortOrder,
        }),
      ),
    });
    expect(savedAgain.status).toBe(200);

    const before = await request(app)
      .get(`/api/patients/${patientId}/feeding`)
      .set(bearer(vet.body.accessToken));
    const mismatch = await request(app)
      .post(`/api/patients/${patientId}/diet`)
      .set(bearer(vet.body.accessToken))
      .send({ weightKg: 10, mealsPerDay: 5 });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.message).toMatch(/no coincide/i);
    const after = await request(app)
      .get(`/api/patients/${patientId}/feeding`)
      .set(bearer(vet.body.accessToken));
    expect(after.body.mealsPerDay).toBe(before.body.mealsPerDay);
    expect(after.body.recommendedAmount).toBe(before.body.recommendedAmount);
    expect(after.body.meals.map((meal: { id: string }) => meal.id)).toEqual(
      before.body.meals.map((meal: { id: string }) => meal.id),
    );
  });

  it('un id de comida inexistente responde 400 y no cambia el plan', async () => {
    const { vet, patientId } = await clinicWithOwner();
    const plan = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody([
        { label: 'Desayuno', time: '08:00' },
        { label: 'Cena', time: '19:00' },
      ]),
    );
    expect(plan.status).toBe(200);
    const breakfast = plan.body.meals[0];
    const rejected = await putPlan(
      vet.body.accessToken,
      patientId,
      planBody(
        [
          { id: breakfast.id, label: 'Cambiado', time: '08:00' },
          { id: 'fm_no_existe', label: 'Fantasma', time: '19:00' },
        ],
        { recommendedAmount: '999 g' },
      ),
    );
    expect(rejected.status).toBe(400);
    expect(rejected.body.message).toMatch(/Comida no encontrada/);

    const after = await request(app)
      .get(`/api/patients/${patientId}/feeding`)
      .set(bearer(vet.body.accessToken));
    expect(after.body.recommendedAmount).toBe('200 g');
    expect(after.body.meals.find((meal: { id: string }) => meal.id === breakfast.id).label).toBe(
      'Desayuno',
    );
    expect(after.body.meals).toHaveLength(2);
  });
});
