import { DomainError } from '../../../src/domain/shared/DomainError';
import {
  canonicalAppointmentStatus,
  lastProposalBy,
  stripInternalTags,
} from '../../../src/domain/scheduling/appointmentNotes';
import { assertBookableAppointmentSlot } from '../../../src/application/scheduling/appointmentSlot';
import { addCalendarDays, todayInBusinessZone } from '../../../src/shared/businessTime';

const savedTz = process.env.APP_TZ;

beforeEach(() => {
  process.env.APP_TZ = 'America/El_Salvador';
});

afterAll(() => {
  if (savedTz === undefined) delete process.env.APP_TZ;
  else process.env.APP_TZ = savedTz;
});

describe('stripInternalTags', () => {
  const marks = [
    '[Propuesta vet]',
    '[Propuesta owner]',
    '[propuesta VET]',
    '[ Propuesta vet ]',
    '[  Propuesta   owner  ]',
    '[Aplazamiento]',
    '[ Aplazamiento ]',
    '[Rechazada]',
    '[ rechazada ]',
    '[Cancelada 2026-01-01T00:00:00.000Z]',
    '[Eliminada por el sistema]',
    '[Cita cancelada por la clínica]',
    '[ Cita   cancelada   por   la   clínica ]',
    '[CITA CANCELADA POR LA CLÍNICA]',
  ];

  it.each(marks)('quita %s y deja el resto del texto', (mark) => {
    expect(stripInternalTags(`Revisión ${mark} general`)).toBe('Revisión general');
    expect(stripInternalTags(mark)).toBe('');
  });

  it('conserva un corchete que no es marca interna', () => {
    expect(stripInternalTags('[urgente] le duele la pata')).toBe('[urgente] le duele la pata');
  });

  it('la última marca [Propuesta …] dice quién propuso', () => {
    expect(lastProposalBy('Revisión')).toBeNull();
    expect(lastProposalBy('[Propuesta owner]\n[Propuesta vet]')).toBe('vet');
    expect(lastProposalBy('[Propuesta vet]\n[ Propuesta owner ]')).toBe('owner');
  });

  it('solo acepta estados de cita conocidos y trata Eliminada como Cancelada', () => {
    expect(canonicalAppointmentStatus('programada')).toBe('Programada');
    expect(canonicalAppointmentStatus('ELIMINADA')).toBe('Cancelada');
    expect(canonicalAppointmentStatus('EstadoInventado')).toBeNull();
  });
});

describe('horario de la cita', () => {
  it('rechaza una fecha imposible, una hora imposible y una fecha pasada', () => {
    expect(() => assertBookableAppointmentSlot('no-es-fecha', '10:00')).toThrow(DomainError);
    expect(() => assertBookableAppointmentSlot('2026-10-08', '99:99')).toThrow(DomainError);
    expect(() => assertBookableAppointmentSlot('2020-01-01', '10:00')).toThrow(/pasado/);
  });

  it('acepta una fecha futura en El Salvador', () => {
    const date = addCalendarDays(todayInBusinessZone(), 2);
    expect(() => assertBookableAppointmentSlot(date, '10:00')).not.toThrow();
  });
});
