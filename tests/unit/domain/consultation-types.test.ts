import {
  formatConsultationNumber,
  toOwnerConsultationView,
  isConsultationType,
} from '../../../src/domain/patients/ConsultationTypes';

describe('ConsultationTypes', () => {
  it('formats CONS numbers with padding', () => {
    expect(formatConsultationNumber(1)).toBe('CONS-000001');
    expect(formatConsultationNumber(42)).toBe('CONS-000042');
  });

  it('recognizes consultation types', () => {
    expect(isConsultationType('GENERAL')).toBe(true);
    expect(isConsultationType('FOO')).toBe(false);
  });

  it('strips private notes from owner view', () => {
    const owner = toOwnerConsultationView({
      id: '1',
      consultationNumber: 'CONS-000001',
      type: 'GENERAL',
      date: '2026-01-01',
      vetName: 'Dr',
      status: 'Finalizada',
      reason: 'Chequeo',
      diagnosis: 'OK',
      treatment: 'Nada',
      privateNotes: 'secreto',
      physicalExam: 'interno',
      notes: 'admin',
    });
    expect(owner.privateNotes).toBeUndefined();
    expect(owner.physicalExam).toBeUndefined();
    expect(owner.diagnosis).toBe('OK');
    expect(owner.reason).toBe('Chequeo');
  });
});
