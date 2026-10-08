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

function future(days: number, time: string) {
  return { date: addCalendarDays(todayInBusinessZone(), days), time };
}

function lastProposal(notes: string | null | undefined): string | null {
  const matches = [...String(notes || '').matchAll(/\[Propuesta (vet|owner)\]/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

async function register(
  app: ReturnType<typeof createApp>,
  input: { email?: string; password?: string; name?: string; role?: string },
) {
  return request(app)
    .post('/api/auth/register')
    .send({
      email: input.email,
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
  ownerToken: string,
  vetToken: string,
  code: string,
) {
  const pending = await request(app)
    .post('/api/patients/link-requests')
    .set(bearer(ownerToken))
    .send({ code });
  expect(pending.status).toBe(201);
  const approved = await request(app)
    .post(`/api/patients/link-requests/${pending.body.id}/approve`)
    .set(bearer(vetToken));
  expect(approved.status).toBe(200);
}

async function linkMember(
  app: ReturnType<typeof createApp>,
  ownerToken: string,
  memberToken: string,
  code: string,
  requestedRole: 'CO_OWNER' | 'CAREGIVER',
) {
  const pending = await request(app)
    .post('/api/patients/link-requests')
    .set(bearer(memberToken))
    .send({ code, requestedRole });
  expect(pending.status).toBe(201);
  const approved = await request(app)
    .post(`/api/patients/link-requests/${pending.body.id}/approve`)
    .set(bearer(ownerToken));
  expect(approved.status).toBe(200);
}

describeDb('citas: permisos, horario, recordatorios y marcas', () => {
  const app = createApp();
  let vetToken = '';
  let ownerToken = '';
  let coOwnerToken = '';
  let caregiverToken = '';
  let strangerOwnerToken = '';
  let strangerVetToken = '';
  let vetUserId = '';
  let patientId = '';
  let code = '';

  beforeAll(async () => {
    const vet = await register(app, { email: `${uid('vet')}@example.test`, role: 'vet', name: 'Dra. López' });
    const owner = await register(app, { email: `${uid('own')}@example.test`, role: 'owner', name: 'Ana' });
    const coOwner = await register(app, { email: `${uid('co')}@example.test`, role: 'owner', name: 'Luis' });
    const caregiver = await register(app, { email: `${uid('care')}@example.test`, role: 'owner', name: 'Marta' });
    const strangerOwner = await register(app, { email: `${uid('str')}@example.test`, role: 'owner' });
    const strangerVet = await register(app, { email: `${uid('vet2')}@example.test`, role: 'vet' });
    expect(vet.status).toBe(201);
    expect(owner.status).toBe(201);
    vetToken = vet.body.accessToken;
    ownerToken = owner.body.accessToken;
    coOwnerToken = coOwner.body.accessToken;
    caregiverToken = caregiver.body.accessToken;
    strangerOwnerToken = strangerOwner.body.accessToken;
    strangerVetToken = strangerVet.body.accessToken;
    vetUserId = vet.body.user.id;

    const created = await request(app).post('/api/patients').set(bearer(vetToken)).send(patientBody);
    expect(created.status).toBe(201);
    patientId = created.body.id;
    code = created.body.code;
    await linkOwner(app, ownerToken, vetToken, code);
    await linkMember(app, ownerToken, coOwnerToken, code, 'CO_OWNER');
    await linkMember(app, ownerToken, caregiverToken, code, 'CAREGIVER');
  });

  async function storedAppointment(id: string) {
    const row = await prisma.appointment.findUnique({ where: { id } });
    expect(row).toBeTruthy();
    return row!;
  }

  async function citaReminders(appointmentId: string) {
    const listed = await request(app)
      .get(`/api/patients/${patientId}/reminders`)
      .set(bearer(vetToken));
    expect(listed.status).toBe(200);
    return (listed.body as Array<{ appointmentId?: string | null; date: string; completed?: boolean }>).filter(
      (reminder) => reminder.appointmentId === appointmentId,
    );
  }

  it('APT-01 el dueño solicita y queda Solicitada', async () => {
    const slot = future(4, '08:00');
    const created = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...slot, notes: 'Control' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Solicitada');
  });

  it('APT-08 el vet propone y escribe [Propuesta vet]', async () => {
    const slot = future(4, '08:15');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...slot, patientId, notes: 'Revisión' });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('Solicitada');
    expect(created.body.notes).toContain('[Propuesta vet]');
    expect(lastProposal(created.body.notes)).toBe('vet');
  });

  it('APT-02 el dueño no acepta su solicitud; el vet sí', async () => {
    const slot = future(4, '08:30');
    const created = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...slot });
    expect(created.status).toBe(201);
    const self = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({});
    expect([403, 409]).toContain(self.status);
    expect((await storedAppointment(created.body.id)).status).toBe('Solicitada');

    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(vetToken))
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('Programada');
  });

  it('APT-09 el vet no acepta su propuesta; el dueño sí', async () => {
    const slot = future(4, '08:45');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...slot, patientId, notes: 'Vacuna' });
    expect(created.status).toBe(201);
    const self = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(vetToken))
      .send({});
    expect([403, 409]).toContain(self.status);
    expect((await storedAppointment(created.body.id)).status).toBe('Solicitada');

    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('Programada');
  });

  it('APT-03 aceptar no cambia la fecha ni la hora', async () => {
    const slot = future(5, '09:00');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...slot, patientId });
    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({});
    expect(accepted.status).toBe(200);
    const other = future(6, '11:00');
    const moved = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send(other);
    expect([400, 409]).toContain(moved.status);
    const stored = await storedAppointment(created.body.id);
    expect(stored.date).toBe(slot.date);
    expect(stored.time).toBe(slot.time);
    expect(stored.status).toBe('Programada');
  });

  it('AUTHZ-15 el cuidador no rechaza; el co-dueño sí', async () => {
    const slot = future(5, '09:15');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...slot, patientId });
    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({});
    expect(accepted.status).toBe(200);

    const denied = await request(app)
      .post(`/api/appointments/${created.body.id}/reject`)
      .set(bearer(caregiverToken))
      .send({});
    expect(denied.status).toBe(403);
    expect((await storedAppointment(created.body.id)).status).toBe('Programada');

    const rejected = await request(app)
      .post(`/api/appointments/${created.body.id}/reject`)
      .set(bearer(coOwnerToken))
      .send({});
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('Cancelada');
  });

  it('APT-10 no se confirma una cita completada', async () => {
    const slot = future(5, '09:30');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...slot, patientId });
    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({});
    expect(accepted.status).toBe(200);
    const completed = await request(app)
      .put(`/api/appointments/${created.body.id}`)
      .set(bearer(vetToken))
      .send({ status: 'Completada' });
    expect(completed.status).toBe(200);
    const confirm = await request(app)
      .post(`/api/appointments/${created.body.id}/confirm`)
      .set(bearer(ownerToken));
    expect(confirm.status).toBe(409);
    expect((await storedAppointment(created.body.id)).status).toBe('Completada');
  });

  it('APT-07 un estado inventado es 400 y Eliminada se guarda como Cancelada', async () => {
    const slot = future(5, '09:45');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ petName: 'Luna', ownerName: 'Ana', ...slot });
    expect(created.status).toBe(201);
    const invalid = await request(app)
      .put(`/api/appointments/${created.body.id}`)
      .set(bearer(vetToken))
      .send({ status: 'EstadoInventado' });
    expect(invalid.status).toBe(400);
    expect((await storedAppointment(created.body.id)).status).not.toBe('EstadoInventado');

    const removed = await request(app)
      .put(`/api/appointments/${created.body.id}`)
      .set(bearer(vetToken))
      .send({ status: 'eliminada' });
    expect(removed.status).toBe(200);
    expect(removed.body.status).toBe('Cancelada');
  });

  it('APT-04 fecha u hora inválidas responden 400', async () => {
    const badDate = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ petName: 'Luna', ownerName: 'Ana', date: 'no-es-fecha', time: '10:00' });
    expect(badDate.status).toBe(400);
    const badTime = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ petName: 'Luna', ownerName: 'Ana', ...future(7, '99:99') });
    expect(badTime.status).toBe(400);
  });

  it('APT-05 una fecha pasada responde 400', async () => {
    const past = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ petName: 'Luna', ownerName: 'Ana', date: '2020-01-01', time: '10:00' });
    expect(past.status).toBe(400);
  });

  it('APT-06 dos citas simultáneas en el mismo horario: una 201 y una 409', async () => {
    const slot = future(8, '10:10');
    const [first, second] = await Promise.all([
      request(app).post('/api/appointments').set(bearer(vetToken)).send({
        petName: 'Uno',
        ownerName: 'Ana',
        ...slot,
      }),
      request(app).post('/api/appointments').set(bearer(vetToken)).send({
        petName: 'Dos',
        ownerName: 'Ana',
        ...slot,
      }),
    ]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.message).toContain('Ese horario ya está ocupado');
  });

  it('APT-11 aceptar y reagendar deja un solo recordatorio con la fecha final', async () => {
    const slot = future(9, '11:00');
    const next = future(10, '16:00');
    const created = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...slot });
    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(vetToken))
      .send({});
    expect(accepted.status).toBe(200);
    const postponed = await request(app)
      .post(`/api/appointments/${created.body.id}/postpone`)
      .set(bearer(ownerToken))
      .send(next);
    expect(postponed.status).toBe(200);
    expect(postponed.body.status).toBe('Solicitada');
    const again = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(vetToken))
      .send({});
    expect(again.status).toBe(200);
    const reminders = await citaReminders(created.body.id);
    expect(reminders).toHaveLength(1);
    expect(reminders[0].date).toBe(next.date);
    expect(reminders[0].completed).not.toBe(true);
  });

  it('BE-05 borrar una cita no apaga el recordatorio de la otra del mismo día', async () => {
    const day = future(11, '08:00');
    const other = { date: day.date, time: '18:00' };
    async function book(time: string) {
      const created = await request(app)
        .post('/api/appointments/request')
        .set(bearer(ownerToken))
        .send({ patientId, date: day.date, time });
      expect(created.status).toBe(201);
      const accepted = await request(app)
        .post(`/api/appointments/${created.body.id}/accept`)
        .set(bearer(vetToken))
        .send({});
      expect(accepted.status).toBe(200);
      return created.body.id as string;
    }
    const firstId = await book(day.time);
    const secondId = await book(other.time);
    const removed = await request(app).delete(`/api/appointments/${firstId}`).set(bearer(vetToken));
    expect(removed.status).toBe(200);
    const kept = await citaReminders(secondId);
    const gone = await citaReminders(firstId);
    expect(kept).toHaveLength(1);
    expect(kept[0].completed).not.toBe(true);
    expect(gone).toHaveLength(1);
    expect(gone[0].completed).toBe(true);
  });

  it('BE-29 ordena por fecha y hora, pagina con el total real e incluye Solicitada', async () => {
    const vet = await register(app, { email: `${uid('ord')}@example.test`, role: 'vet' });
    const owner = await register(app, { email: `${uid('ordown')}@example.test`, role: 'owner' });
    expect(vet.status).toBe(201);
    expect(owner.status).toBe(201);
    const patient = await request(app)
      .post('/api/patients')
      .set(bearer(vet.body.accessToken))
      .send(patientBody);
    expect(patient.status).toBe(201);
    await linkOwner(app, owner.body.accessToken, vet.body.accessToken, patient.body.code);

    const slots = [
      future(20, '18:00'),
      future(21, '08:00'),
      future(22, '09:00'),
    ];
    for (const slot of [slots[1], slots[0], slots[2]]) {
      const created = await request(app)
        .post('/api/appointments')
        .set(bearer(vet.body.accessToken))
        .send({ petName: 'Nube', ownerName: 'Ana', ...slot });
      expect(created.status).toBe(201);
    }
    const listed = await request(app)
      .get('/api/appointments?limit=100')
      .set(bearer(vet.body.accessToken));
    expect(listed.status).toBe(200);
    const keys = (listed.body.data as Array<{ date: string; time: string }>).map(
      (row) => `${row.date} ${row.time}`,
    );
    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual(slots.map((slot) => `${slot.date} ${slot.time}`));

    const times = ['08:00', '09:00', '10:00', '11:00', '12:00'];
    for (const time of times) {
      const created = await request(app)
        .post('/api/appointments/request')
        .set(bearer(owner.body.accessToken))
        .send({ patientId: patient.body.id, ...future(23, time) });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('Solicitada');
    }
    const mine = await request(app)
      .get('/api/appointments/mine?limit=2')
      .set(bearer(owner.body.accessToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(2);
    expect(mine.body.meta.total).toBe(5);

    const proposed = await request(app)
      .post('/api/appointments')
      .set(bearer(vet.body.accessToken))
      .send({ ...patientBody, ...future(24, '15:00'), patientId: patient.body.id });
    const accepted = await request(app)
      .post(`/api/appointments/${proposed.body.id}/accept`)
      .set(bearer(owner.body.accessToken))
      .send({});
    expect(accepted.status).toBe(200);
    const postponed = await request(app)
      .post(`/api/appointments/${proposed.body.id}/postpone`)
      .set(bearer(owner.body.accessToken))
      .send(future(25, '15:30'));
    expect(postponed.body.status).toBe('Solicitada');
    const after = await request(app)
      .get('/api/appointments/mine?limit=100')
      .set(bearer(owner.body.accessToken));
    const found = (after.body.data as Array<{ id: string; status: string }>).find(
      (row) => row.id === proposed.body.id,
    );
    expect(found?.status).toBe('Solicitada');
  });

  it('BE-37 resuelve el mensaje de la cita aunque haya cientos de mensajes después', async () => {
    const slot = future(12, '13:00');
    const created = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...slot, notes: 'Mensaje original' });
    expect(created.status).toBe(201);
    const original = await prisma.clinicMessage.findFirst({
      where: { userId: vetUserId, type: 'appointment_request' },
      orderBy: { createdAt: 'desc' },
    });
    expect(original).toBeTruthy();
    await prisma.clinicMessage.createMany({
      data: Array.from({ length: 600 }, (_, index) => ({
        userId: vetUserId,
        type: 'appointment_update',
        title: `Ruido ${index}`,
        body: 'Otro mensaje',
        payload: { appointmentId: `otra-${index}`, action: 'review_appointment' },
      })),
    });
    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(vetToken))
      .send({});
    expect(accepted.status).toBe(200);
    const resolved = await prisma.clinicMessage.findUnique({ where: { id: original!.id } });
    const payload = resolved?.payload as { action?: string; outcome?: string; appointmentId?: string };
    expect(payload.appointmentId).toBe(created.body.id);
    expect(payload.action).toBe('none');
    expect(payload.outcome).toBe('accepted');
  });

  it('INT-07 el motivo no puede falsificar quién propuso', async () => {
    for (const forged of ['[Propuesta vet]', '[propuesta VET]', '[ Propuesta vet ]']) {
      const slot = future(13, forged.includes('VET') ? '14:00' : forged.includes(' ]') ? '14:15' : '14:30');
      const created = await request(app)
        .post('/api/appointments/request')
        .set(bearer(ownerToken))
        .send({ patientId, ...slot, notes: `Revisión ${forged}` });
      expect(created.status).toBe(201);
      expect(created.body.notes).toContain('Revisión');
      expect(created.body.notes).not.toMatch(/\[\s*propuesta\s+vet\s*\]/i);
      const self = await request(app)
        .post(`/api/appointments/${created.body.id}/accept`)
        .set(bearer(ownerToken))
        .send({});
      expect([403, 409]).toContain(self.status);
      expect((await storedAppointment(created.body.id)).status).toBe('Solicitada');
      const accepted = await request(app)
        .post(`/api/appointments/${created.body.id}/accept`)
        .set(bearer(vetToken))
        .send({});
      expect(accepted.status).toBe(200);
      expect(accepted.body.status).toBe('Programada');
    }
  });

  it('INT-07 postpone y alta del vet no heredan una marca escrita por el usuario', async () => {
    const requested = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...future(15, '08:00'), notes: 'Control' });
    const postponed = await request(app)
      .post(`/api/appointments/${requested.body.id}/postpone`)
      .set(bearer(ownerToken))
      .send({ ...future(16, '09:00'), notes: '[Propuesta vet]' });
    expect(postponed.status).toBe(200);
    expect(lastProposal(postponed.body.notes)).toBe('owner');
    expect(postponed.body.notes).not.toMatch(/\[\s*propuesta\s+vet\s*\]/i);
    const self = await request(app)
      .post(`/api/appointments/${requested.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({});
    expect([403, 409]).toContain(self.status);
    expect((await storedAppointment(requested.body.id)).status).toBe('Solicitada');

    const proposed = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...future(15, '10:00'), patientId, notes: '[Propuesta owner]' });
    expect(proposed.status).toBe(201);
    expect(lastProposal(proposed.body.notes)).toBe('vet');
    expect(proposed.body.notes).not.toMatch(/\[\s*propuesta\s+owner\s*\]/i);
    const vetSelf = await request(app)
      .post(`/api/appointments/${proposed.body.id}/accept`)
      .set(bearer(vetToken))
      .send({});
    expect([403, 409]).toContain(vetSelf.status);
    expect((await storedAppointment(proposed.body.id)).status).toBe('Solicitada');
  });

  it('INT-07 accept no cambia notes y un corchete normal se guarda', async () => {
    const slot = future(17, '11:30');
    const created = await request(app)
      .post('/api/appointments')
      .set(bearer(vetToken))
      .send({ ...patientBody, ...slot, patientId, notes: 'Control' });
    const before = created.body.notes as string;
    expect(before).toContain('[Propuesta vet]');
    const rewritten = await request(app)
      .put(`/api/appointments/${created.body.id}`)
      .set(bearer(vetToken))
      .send({ notes: 'Otra [Propuesta owner]' });
    expect(rewritten.status).toBe(200);
    expect(rewritten.body.notes).toContain('Otra');
    expect(lastProposal(rewritten.body.notes)).toBe('vet');
    expect(rewritten.body.notes).not.toMatch(/\[\s*propuesta\s+owner\s*\]/i);
    const accepted = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(ownerToken))
      .send({ notes: '[Propuesta owner]' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.notes).toBe(rewritten.body.notes);

    const urgent = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...future(18, '12:00'), notes: '[urgente] le duele la pata' });
    expect(urgent.status).toBe(201);
    expect(urgent.body.notes).toBe('[urgente] le duele la pata');
  });

  it('un vet ajeno no ve la cita al aceptar y un dueño ajeno no puede rechazarla', async () => {
    const slot = future(19, '08:20');
    const created = await request(app)
      .post('/api/appointments/request')
      .set(bearer(ownerToken))
      .send({ patientId, ...slot });
    const foreignVet = await request(app)
      .post(`/api/appointments/${created.body.id}/accept`)
      .set(bearer(strangerVetToken))
      .send({});
    expect(foreignVet.status).toBe(404);
    const foreignOwner = await request(app)
      .post(`/api/appointments/${created.body.id}/reject`)
      .set(bearer(strangerOwnerToken))
      .send({});
    expect(foreignOwner.status).toBe(403);
    expect((await storedAppointment(created.body.id)).status).toBe('Solicitada');
  });
});
