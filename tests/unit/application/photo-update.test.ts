import { DomainError } from '../../../src/domain/shared/DomainError';
import { User } from '../../../src/domain/identity/User';
import { UserRepository } from '../../../src/domain/identity/UserRepository';
import { Patient } from '../../../src/domain/patients/Patient';
import { PatientRepository } from '../../../src/domain/patients/PatientRepository';
import { PatientAccessRepository } from '../../../src/domain/access/PatientAccessRepository';
import { UpdatePatient } from '../../../src/application/patients/PatientUseCases';
import { UpdateProfile } from '../../../src/application/identity/UpdateProfile';
import { BcryptHasher } from '../../../src/infrastructure/auth/BcryptHasher';
import { RefreshTokenStore } from '../../../src/infrastructure/auth/RefreshTokenStore';

const INVALID = 'La foto debe ser una imagen JPG, PNG o WebP.';

function dataUrl(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

const OLD_GIF = dataUrl('image/gif', Buffer.from('GIF89a'));
const OLD_SVG = dataUrl(
  'image/svg+xml',
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
);

function makePatient(photo: string | null): Patient {
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
    photo,
  });
}

function makeUser(photo: string | null): User {
  return new User({
    id: 'u1',
    email: 'ana@example.com',
    password: 'hash',
    name: 'Ana',
    role: 'owner',
    photo,
  });
}

describe('update de foto ya guardada', () => {
  const vet = { id: 'vet1', role: 'vet' as const };

  function patientUseCase(patient: Patient) {
    const update = jest.fn(async () => patient);
    const patients = {
      findById: jest.fn(async () => patient),
      update,
    } as unknown as PatientRepository;
    const accesses = {
      findActive: jest.fn(async () => null),
    } as unknown as PatientAccessRepository;
    return { uc: new UpdatePatient(patients, accesses), update };
  }

  function profileUseCase(user: User) {
    const update = jest.fn(async (_id: string, data: { photo?: string | null; name?: string }) => {
      return new User({ ...user.props, ...data });
    });
    const users = {
      findById: jest.fn(async () => user),
      update,
    } as unknown as UserRepository;
    const uc = new UpdateProfile(users, {} as BcryptHasher, {} as RefreshTokenStore);
    return { uc, update };
  }

  it('edita la mascota si reenvía el gif antiguo', async () => {
    const { uc, update } = patientUseCase(makePatient(OLD_GIF));
    await uc.execute(vet, 'p1', { name: 'Luna', photo: OLD_GIF });
    expect(update).toHaveBeenCalledWith('p1', { name: 'Luna' });
  });

  it('edita el perfil si reenvía el svg antiguo', async () => {
    const { uc, update } = profileUseCase(makeUser(OLD_SVG));
    await uc.execute('u1', { name: 'Ana López', photo: OLD_SVG });
    expect(update).toHaveBeenCalledWith('u1', { name: 'Ana López' });
  });

  it('responde 400 si la mascota recibe una foto nueva inválida', async () => {
    const { uc, update } = patientUseCase(makePatient('https://cdn.example.com/luna.png'));
    await expect(uc.execute(vet, 'p1', { name: 'Luna', photo: OLD_GIF })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: INVALID,
    } satisfies Partial<DomainError>);
    expect(update).not.toHaveBeenCalled();
  });

  it('responde 400 si el perfil recibe una foto nueva inválida', async () => {
    const { uc, update } = profileUseCase(makeUser('https://cdn.example.com/ana.png'));
    await expect(uc.execute('u1', { name: 'Ana', photo: OLD_SVG })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: INVALID,
    } satisfies Partial<DomainError>);
    expect(update).not.toHaveBeenCalled();
  });

  it('guarda un placeholder nuevo en la mascota', async () => {
    const { uc, update } = patientUseCase(makePatient(null));
    await uc.execute(vet, 'p1', { photo: '../assets/placeholder-pet.svg' });
    expect(update).toHaveBeenCalledWith('p1', { photo: '../assets/placeholder-pet.svg' });
  });
});
