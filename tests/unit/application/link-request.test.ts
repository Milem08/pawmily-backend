import { Patient } from '../../../src/domain/patients/Patient';
import { CreateLinkRequest, ApproveLinkRequest } from '../../../src/application/access/LinkRequestUseCases';
import { AuditService } from '../../../src/infrastructure/audit/AuditService';
import { DomainError } from '../../../src/domain/shared/DomainError';

describe('link request flow', () => {
  const patient = new Patient({
    id: 'p1',
    code: 'PAW-8F42K91',
    barcodePayload: 'PAW-8F42K91',
    name: 'Luna',
    species: 'gato',
    breed: 'Común',
    age: '2',
    sex: 'H',
    ownerName: 'Pendiente',
    vetId: 'vet1',
    ownerUserId: null,
  });

  it('creates OWNER request when pet has no owner', async () => {
    const patients = {
      findByCode: jest.fn(async () => patient),
      findById: jest.fn(async () => patient),
      claimPrimaryOwner: jest.fn(async () => patient),
    } as any;
    const accesses = {
      findActive: jest.fn(async () => null),
      findActiveOwner: jest.fn(async () => null),
      upsertActive: jest.fn(async (d) => ({ ...d, id: 'a1', status: 'ACTIVE', createdAt: new Date() })),
    } as any;
    const links = {
      findPending: jest.fn(async () => null),
      create: jest.fn(async (d) => ({
        id: 'lr1',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...d,
      })),
      findById: jest.fn(),
      decidePending: jest.fn(),
      approveWithGrant: jest.fn(),
    } as any;
    const audit = new AuditService();
    const uc = new CreateLinkRequest(patients, accesses, links, audit);
    const req = await uc.execute({ id: 'owner1', role: 'owner' }, { code: 'PAW-8F42K91' });
    expect(req.requestedRole).toBe('OWNER');
    expect(links.create).toHaveBeenCalled();
  });

  it('vet approves OWNER request atomically via approveWithGrant', async () => {
    const patients = {
      findById: jest.fn(async () => patient),
    } as any;
    const accesses = {
      findActive: jest.fn(async () => null),
      findActiveOwner: jest.fn(async () => null),
    } as any;
    const links = {
      findById: jest.fn(async () => ({
        id: 'lr1',
        requesterId: 'owner1',
        patientId: 'p1',
        requestedRole: 'OWNER',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      decidePending: jest.fn(),
      approveWithGrant: jest.fn(async () => ({ id: 'lr1', status: 'APPROVED' })),
    } as any;
    const users = {
      findById: jest.fn(async () => ({
        id: 'owner1',
        props: { name: 'Ana', phone: null, email: 'ana@test.com' },
      })),
    } as any;
    const audit = new AuditService();
    const uc = new ApproveLinkRequest(patients, accesses, links, users, audit);
    const decided = await uc.execute({ id: 'vet1', role: 'vet' }, 'lr1');
    expect(decided.status).toBe('APPROVED');
    expect(links.approveWithGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner1',
        role: 'OWNER',
        claimOwner: expect.objectContaining({ ownerName: 'Ana' }),
      }),
    );
  });

  it('heals partial OWNER approve instead of 409', async () => {
    const owned = new Patient({
      ...patient.props,
      ownerUserId: 'owner1',
    });
    const patients = {
      findById: jest.fn(async () => owned),
    } as any;
    const accesses = {
      findActive: jest.fn(async () => ({
        id: 'a1',
        userId: 'owner1',
        patientId: 'p1',
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: new Date(),
      })),
      findActiveOwner: jest.fn(async () => ({
        id: 'a1',
        userId: 'owner1',
        patientId: 'p1',
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: new Date(),
      })),
    } as any;
    const links = {
      findById: jest.fn(async () => ({
        id: 'lr1',
        requesterId: 'owner1',
        patientId: 'p1',
        requestedRole: 'OWNER',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      decidePending: jest.fn(async () => ({ id: 'lr1', status: 'APPROVED' })),
      approveWithGrant: jest.fn(),
    } as any;
    const users = { findById: jest.fn() } as any;
    const audit = new AuditService();
    const uc = new ApproveLinkRequest(patients, accesses, links, users, audit);
    const decided = await uc.execute({ id: 'vet1', role: 'vet' }, 'lr1');
    expect(decided.status).toBe('APPROVED');
    expect(links.decidePending).toHaveBeenCalled();
    expect(links.approveWithGrant).not.toHaveBeenCalled();
  });

  it('rejects OWNER approve when another owner already exists', async () => {
    const owned = new Patient({
      ...patient.props,
      ownerUserId: 'other',
    });
    const patients = {
      findById: jest.fn(async () => owned),
    } as any;
    const accesses = {
      findActive: jest.fn(async () => null),
      findActiveOwner: jest.fn(async () => ({
        id: 'a1',
        userId: 'other',
        patientId: 'p1',
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: new Date(),
      })),
    } as any;
    const links = {
      findById: jest.fn(async () => ({
        id: 'lr1',
        requesterId: 'owner1',
        patientId: 'p1',
        requestedRole: 'OWNER',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      decidePending: jest.fn(),
      approveWithGrant: jest.fn(),
    } as any;
    const users = { findById: jest.fn() } as any;
    const uc = new ApproveLinkRequest(patients, accesses, links, users, new AuditService());
    await expect(uc.execute({ id: 'vet1', role: 'vet' }, 'lr1')).rejects.toMatchObject({
      statusCode: 409,
    } as DomainError);
  });
});
