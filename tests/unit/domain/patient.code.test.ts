import { formatPatientCode } from '../../../src/domain/patients/Patient';
import {
  generateSecurePatientCode,
  isLegacyPatientCode,
  isSecurePatientCode,
  normalizePatientCode,
} from '../../../src/domain/patients/PatientCode';
import { canAccessRolePerform } from '../../../src/domain/access/PatientAccessRole';
import { visibleRemindersForActor } from '../../../src/domain/patients/ReminderVisibility';

describe('formatPatientCode (legacy)', () => {
  it('pads sequence to 6 digits', () => {
    expect(formatPatientCode(1)).toBe('PAW-000001');
    expect(formatPatientCode(42)).toBe('PAW-000042');
  });

  it('rejects invalid sequences', () => {
    expect(() => formatPatientCode(0)).toThrow();
  });
});

describe('secure patient codes', () => {
  it('generates PAW- + 7 chars without ambiguous symbols', () => {
    const code = generateSecurePatientCode();
    expect(isSecurePatientCode(code)).toBe(true);
    expect(code).not.toMatch(/[IO01]/);
  });

  it('detects legacy vs secure', () => {
    expect(isLegacyPatientCode('PAW-000001')).toBe(true);
    expect(isSecurePatientCode('PAW-000001')).toBe(false);
    expect(normalizePatientCode(' paw-abc23xy ')).toBe('PAW-ABC23XY');
  });
});

describe('patient access matrix', () => {
  it('allows vet clinical write and owner personal reminders', () => {
    expect(canAccessRolePerform('VET', 'WRITE_CLINICAL')).toBe(true);
    expect(canAccessRolePerform('VET', 'WRITE_PERSONAL_REMINDER')).toBe(false);
    expect(canAccessRolePerform('OWNER', 'WRITE_CLINICAL')).toBe(false);
    expect(canAccessRolePerform('OWNER', 'WRITE_PERSONAL_REMINDER')).toBe(true);
    expect(canAccessRolePerform('CO_OWNER', 'WRITE_PERSONAL_REMINDER')).toBe(true);
    expect(canAccessRolePerform('CAREGIVER', 'WRITE_PERSONAL_REMINDER')).toBe(false);
    expect(canAccessRolePerform('CAREGIVER', 'READ_CLINICAL')).toBe(true);
    expect(canAccessRolePerform('OWNER', 'APPROVE_MEMBER_LINK')).toBe(true);
    expect(canAccessRolePerform('VET', 'APPROVE_OWNER_LINK')).toBe(true);
  });
});

describe('reminder visibility', () => {
  const rows = [
    { type: 'cita', category: 'cita', createdByUserId: 'vet1' },
    { type: 'recordatorio', category: 'baño', createdByUserId: 'owner1' },
    { type: 'recordatorio', category: 'alimento', createdByUserId: 'owner1' },
    { type: 'recordatorio', category: 'medicamento', createdByUserId: 'vet1' },
    { type: 'recordatorio', category: 'paseo', createdByUserId: 'other' },
  ];

  it('shows only appointments to the vet', () => {
    const visible = visibleRemindersForActor(rows, 'vet1', 'VET', 'vet');
    expect(visible).toHaveLength(1);
    expect(visible[0].type).toBe('cita');
  });

  it('shows owner personal plus food and medication', () => {
    const visible = visibleRemindersForActor(rows, 'owner1', 'OWNER', 'owner');
    expect(visible.map((r) => r.category).sort()).toEqual(['alimento', 'baño', 'medicamento']);
  });
});
