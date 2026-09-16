import { DomainError } from '../../../src/domain/shared/DomainError';
import { Patient } from '../../../src/domain/patients/Patient';
import { PatientRepository } from '../../../src/domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../../src/domain/access/PatientAccessRepository';
import {
  AddMedicalRecord,
  GenerateDiet,
  LinkPatientByCode,
} from '../../../src/application/patients/PatientUseCases';
import { CreateAppointment } from '../../../src/application/scheduling/AppointmentUseCases';
import { Appointment } from '../../../src/domain/scheduling/Appointment';
import { AppointmentRepository } from '../../../src/domain/scheduling/AppointmentRepository';
import { AuditService } from '../../../src/infrastructure/audit/AuditService';

function makePatient(overrides: Partial<Patient['props']> = {}) {
  return new Patient({
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
    ...overrides,
  });
}

function makeAccessRepo(): PatientAccessRepository {
  return {
    findActive: jest.fn(async () => null),
    listActiveForPatient: jest.fn(async () => []),
    listActivePatientIdsForUser: jest.fn(async () => []),
    upsertActive: jest.fn(),
    revoke: jest.fn(),
    findActiveOwner: jest.fn(async () => null),
  };
}

function makePatientRepo(patient: Patient): PatientRepository {
  const reminders: any[] = [];
  return {
    count: jest.fn(),
    maxCodeSequence: jest.fn(),
    codeExists: jest.fn(async () => false),
    migrateCode: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(async (id) => (id === patient.id ? patient : null)),
    findByCode: jest.fn(async (code) => (code === patient.code ? patient : null)),
    findManyByIds: jest.fn(),
    findByVet: jest.fn(),
    findByOwner: jest.fn(),
    update: jest.fn(),
    setOwnerUserId: jest.fn(async (_id, ownerUserId) => {
      patient.props.ownerUserId = ownerUserId;
      return patient;
    }),
    claimPrimaryOwner: jest.fn(),
    delete: jest.fn(),
    addMedicalRecord: jest.fn(async (_petId, data) => ({
      id: 'mr1',
      petId: patient.id,
      status: 'En proceso',
      ...data,
    })),
    updateMedicalRecord: jest.fn(),
    deleteMedicalRecord: jest.fn(),
    findMedicalRecordById: jest.fn(),
    listMedicalRecords: jest.fn(),
    upsertFeeding: jest.fn(async (_petId, data) => ({
      id: 'f1',
      petId: patient.id,
      ...data,
    })),
    getFeeding: jest.fn(),
    addReminder: jest.fn(async (_petId, data) => {
      const reminder = { id: 'r1', petId: patient.id, ...data };
      reminders.push(reminder);
      return reminder;
    }),
    updateReminder: jest.fn(),
    listReminders: jest.fn(async () => reminders),
    deleteReminder: jest.fn(),
    findReminderById: jest.fn(),
  } as unknown as PatientRepository;
}

describe('patient feature use cases', () => {
  it('deprecates auto-link and points to link-requests', async () => {
    const patient = makePatient();
    const repo = makePatientRepo(patient);
    const accesses = makeAccessRepo();
    const users = { findById: jest.fn() } as any;
    const uc = new LinkPatientByCode(repo, users, accesses);
    await expect(uc.execute({ id: 'owner1', role: 'owner' }, 'PAW-000001')).rejects.toMatchObject({
      statusCode: 400,
    } as DomainError);
  });

  it('returns patient when already linked (legacy or access)', async () => {
    const patient = makePatient({ ownerUserId: 'owner1' });
    const repo = makePatientRepo(patient);
    const accesses = makeAccessRepo();
    const users = { findById: jest.fn() } as any;
    const uc = new LinkPatientByCode(repo, users, accesses);
    const linked = await uc.execute({ id: 'owner1', role: 'owner' }, 'PAW-000001');
    expect(linked.ownerUserId).toBe('owner1');
  });

  it('blocks owner from creating medical records', async () => {
    const patient = makePatient({ ownerUserId: 'owner1' });
    const repo = makePatientRepo(patient);
    const accesses = makeAccessRepo();
    const uc = new AddMedicalRecord(repo, accesses);
    await expect(
      uc.execute(
        { id: 'owner1', role: 'owner' },
        'p1',
        { date: '2026-07-31', reason: 'Control', vetName: 'Dr' },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('generates diet with calories for 10kg dog', async () => {
    const patient = makePatient();
    const repo = makePatientRepo(patient);
    const accesses = makeAccessRepo();
    const uc = new GenerateDiet(repo, accesses);
    const feeding = await uc.execute({ id: 'vet1', role: 'vet' }, 'p1', { weightKg: 10 });
    expect(feeding.caloriesPerDay).toBeGreaterThan(0);
    expect(feeding.recommendedAmount).toBeTruthy();
    expect(feeding.formulaVersion).toBe('rer-mer-v1');
  });

  it('creates appointment reminder of type cita when patientId is set', async () => {
    const patient = makePatient();
    const patients = makePatientRepo(patient);
    const appointments: AppointmentRepository = {
      create: jest.fn(async (data) =>
        new Appointment({
          id: 'a1',
          status: 'Programada',
          ...data,
        }),
      ),
      findById: jest.fn(),
      findByVet: jest.fn(),
      findByPatientIds: jest.fn(),
      findByMonth: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const uc = new CreateAppointment(appointments, patients);
    await uc.execute(
      { id: 'vet1', role: 'vet' },
      {
        petName: 'X',
        ownerName: 'Y',
        date: '2026-08-01',
        time: '10:00',
        patientId: 'p1',
      },
    );

    expect(patients.addReminder).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        type: 'cita',
        appointmentId: 'a1',
        date: '2026-08-01',
        time: '10:00',
      }),
    );
  });

  it('audit service swallows failures', async () => {
    const audit = new AuditService();
    await expect(
      audit.log({ action: 'LOGIN', resourceType: 'Session' }),
    ).resolves.toBeUndefined();
  });
});
