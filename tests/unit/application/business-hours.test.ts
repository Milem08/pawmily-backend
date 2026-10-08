import { DomainError } from '../../../src/domain/shared/DomainError';
import { Patient } from '../../../src/domain/patients/Patient';
import { PatientRepository } from '../../../src/domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../../src/domain/access/PatientAccessRepository';
import { AddMedicalRecord, AddReminder } from '../../../src/application/patients/PatientUseCases';
import { buildReminderNotificationMessage } from '../../../src/domain/patients/NotificationMessage';
import { resolveStoredVetNames } from '../../../src/application/patients/resolveStoredVetName';
import {
  addHoursToLocalDateTime,
  businessNow,
  businessTimeZone,
  localDateTimeToInstant,
} from '../../../src/shared/businessTime';
import {
  buildMedicationDoseSlots,
  medicationDoseCount,
  parseDurationDays,
  parseIntervalHours,
} from '../../../src/application/patients/MedicationDoseReminders';

const savedTz = process.env.APP_TZ;

beforeEach(() => {
  process.env.APP_TZ = 'America/El_Salvador';
});

afterAll(() => {
  if (savedTz === undefined) delete process.env.APP_TZ;
  else process.env.APP_TZ = savedTz;
});

describe('horario del negocio', () => {
  it('sin APP_TZ usa America/El_Salvador', () => {
    delete process.env.APP_TZ;
    expect(businessTimeZone()).toBe('America/El_Salvador');
  });

  it('3 veces al día son 8 h', () => {
    expect(parseIntervalHours('3 veces al día')).toBe(8);
  });

  it('dos veces al dia son 12 h', () => {
    expect(parseIntervalHours('dos veces al dia')).toBe(12);
  });

  it('una vez al día por 12 días son 24 h y 12 días', () => {
    const text = 'una vez al día por 12 días';
    expect(parseIntervalHours(text)).toBe(24);
    expect(parseDurationDays(text, '')).toBe(12);
  });

  it('cada 8 horas por 5 días son 8 h', () => {
    expect(parseIntervalHours('cada 8 horas por 5 días')).toBe(8);
    expect(parseDurationDays('cada 8 horas por 5 días', '')).toBe(5);
  });

  it('cada 2 días son 48 h', () => {
    expect(parseIntervalHours('cada 2 días')).toBe(48);
  });

  it('según indicación pide las horas', () => {
    expect(() => parseIntervalHours('según indicación')).toThrow(DomainError);
    expect(() => parseIntervalHours('según indicación')).toThrow(/Indica cada cuántas horas/);
  });

  it('8 h por 5 días son 15 tomas dentro del periodo', () => {
    expect(medicationDoseCount(5, 8)).toBe(15);
    const slots = buildMedicationDoseSlots('2026-10-06', '08:00', 8, 15);
    expect(slots).toHaveLength(15);
    expect(slots[2]).toEqual({ date: '2026-10-07', time: '00:00' });
    const start = localDateTimeToInstant('2026-10-06', '08:00').getTime();
    const end = start + 5 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < slots.length; i++) {
      const at = localDateTimeToInstant(slots[i].date, slots[i].time).getTime();
      expect(at).toBe(start + i * 8 * 60 * 60 * 1000);
      expect(at).toBeLessThan(end);
    }
  });

  it('por encima de 120 tomas se rechaza con explicación', () => {
    expect(() => medicationDoseCount(41, 8)).toThrow(/máximo permitido es 120/);
  });

  it('48 h por 7 días son 4 tomas', () => {
    expect(medicationDoseCount(7, 48)).toBe(4);
    const slots = buildMedicationDoseSlots('2026-10-06', '08:00', 48, 4);
    const start = localDateTimeToInstant('2026-10-06', '08:00').getTime();
    const end = start + 7 * 24 * 60 * 60 * 1000;
    expect(slots).toHaveLength(4);
    slots.forEach((slot, i) => {
      const at = localDateTimeToInstant(slot.date, slot.time).getTime();
      expect(at).toBe(start + i * 48 * 60 * 60 * 1000);
      expect(at).toBeLessThan(end);
    });
  });

  it('la primera toma 2026-10-06 20:00 cada 12 h sigue en ese orden', () => {
    const slots = [
      addHoursToLocalDateTime('2026-10-06', '20:00', 0),
      addHoursToLocalDateTime('2026-10-06', '20:00', 12),
    ];
    expect(slots).toEqual([
      { date: '2026-10-06', time: '20:00' },
      { date: '2026-10-07', time: '08:00' },
    ]);
  });

  it('a las 23:00 de El Salvador el día siguiente es mañana', () => {
    jest.useFakeTimers({
      now: new Date('2026-10-07T05:00:00.000Z'),
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
      const message = buildReminderNotificationMessage({
        type: 'recordatorio',
        title: 'Control',
        category: 'general',
        petName: 'Firulais',
        date: '2026-10-07',
      });
      expect(message).toBe('Mañana: Control — Firulais.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('20:38 UTC es 14:38 en El Salvador', () => {
    expect(businessNow(new Date('2026-10-06T20:38:00.000Z'))).toMatchObject({
      date: '2026-10-06',
      time: '14:38',
    });
  });
});

describe('consulta y recordatorios de prioridad', () => {
  function accesses(): PatientAccessRepository {
    return {
      findActive: jest.fn(async () => null),
      listActiveForPatient: jest.fn(async () => []),
      listActivePatientIdsForUser: jest.fn(async () => []),
      upsertActive: jest.fn(),
      revoke: jest.fn(),
      findActiveOwner: jest.fn(async () => null),
    };
  }

  it('la hora por defecto y el nombre salen del perfil en hora de El Salvador', async () => {
    const patient = new Patient({
      id: 'p1',
      code: 'PAW-000001',
      barcodePayload: 'PAW-000001',
      name: 'Firulais',
      species: 'perro',
      breed: 'Mestizo',
      age: '3',
      sex: 'M',
      ownerName: 'Ana',
      vetId: 'vet1',
      ownerUserId: null,
    });
    const addMedicalRecord = jest.fn(async (_petId: string, data: { vetName: string; time?: string | null }) => ({
      id: 'mr1',
      petId: 'p1',
      status: 'En Proceso',
      consultationNumber: 'CONS-000001',
      ...data,
    }));
    const repo = { findById: jest.fn(async () => patient), addMedicalRecord } as unknown as PatientRepository;
    const users = {
      findById: jest.fn(async () => ({ props: { name: 'Dra. López' } })),
    };
    const uc = new AddMedicalRecord(repo, accesses(), undefined, users as never);

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
      await uc.execute({ id: 'vet1', role: 'vet' }, 'p1', {
        date: '2026-10-06',
        reason: 'Control',
        vetName: '',
      });
    } finally {
      jest.useRealTimers();
    }

    expect(addMedicalRecord).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ vetName: 'Dra. López', time: '14:38' }),
    );
  });

  it('un vetName guardado como id se muestra con el nombre', async () => {
    const id = `c${'a'.repeat(24)}`;
    const findName = jest.fn(async () => 'Dra. López');
    const rows = await resolveStoredVetNames([{ vetName: id }, { vetName: 'Dra' }], findName);
    expect(rows.map((row) => row.vetName)).toEqual(['Dra. López', 'Dra']);
    expect(findName).toHaveBeenCalledTimes(1);
  });

  it('el cuarto recordatorio de prioridad alta responde 409', async () => {
    const patient = new Patient({
      id: 'p1',
      code: 'PAW-000001',
      barcodePayload: 'PAW-000001',
      name: 'Firulais',
      species: 'perro',
      breed: 'Mestizo',
      age: '3',
      sex: 'M',
      ownerName: 'Ana',
      vetId: 'vet1',
      ownerUserId: 'owner1',
    });
    const addReminder = jest.fn();
    const repo = {
      findById: jest.fn(async () => patient),
      listReminders: jest.fn(async () => [
        { priority: 'alta' },
        { priority: 'alta' },
        { priority: 'Alta' },
      ]),
      addReminder,
    } as unknown as PatientRepository;
    const uc = new AddReminder(repo, accesses());
    await expect(
      uc.execute({ id: 'owner1', role: 'owner' }, 'p1', {
        title: 'Cuarto',
        date: '2027-04-01',
        priority: 'alta',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Ya hay 3 recordatorios prioritarios para esta mascota',
    });
    expect(addReminder).not.toHaveBeenCalled();
  });
});
