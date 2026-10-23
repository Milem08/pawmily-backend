import { DomainError } from '../../../src/domain/shared/DomainError';
import {
  clinicMessageSchema,
  createPatientSchema,
  linkPatientSchema,
  medicalRecordSchema,
  registerSchema,
  reminderSchema,
  requestAppointmentSchema,
  updateConfigSchema,
} from '../../../src/interfaces/http/dto/schemas';
import { parseOptionalSearch } from '../../../src/interfaces/http/dto/textLimits';
import { validateBody } from '../../../src/interfaces/http/middleware/validate';

const registerBase = {
  name: 'Ana',
  email: 'ana@example.com',
  password: 'secreto1',
};

const patientBase = {
  name: 'Luna',
  species: 'Pez',
  age: '1',
  sex: 'hembra',
  ownerName: 'Ana',
};

function expectTooLong(
  parseOk: { success: boolean },
  parseOver: { success: boolean; error?: { errors: Array<{ message: string }> } },
  campo: string,
  max: number,
) {
  expect(parseOk.success).toBe(true);
  expect(parseOver.success).toBe(false);
  if (!parseOver.success) {
    const message = parseOver.error!.errors.map((issue) => issue.message).join('; ');
    expect(message).toContain(`«${campo}»`);
    expect(message).toContain(String(max));
  }
}

describe('límites de texto', () => {
  it('el nombre de persona acepta 80 y rechaza 81 con 400', () => {
    const ok = registerSchema.safeParse({ ...registerBase, name: 'a'.repeat(80) });
    const over = registerSchema.safeParse({ ...registerBase, name: 'a'.repeat(81) });
    expectTooLong(ok, over, 'nombre', 80);

    let captured: unknown;
    validateBody(registerSchema)(
      { body: { ...registerBase, name: 'a'.repeat(81) } } as never,
      {} as never,
      ((err?: unknown) => {
        captured = err;
      }) as never,
    );
    expect(captured).toBeInstanceOf(DomainError);
    const error = captured as DomainError;
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toContain('«nombre»');
    expect(error.message).toContain('80');
  });

  it('la contraseña mantiene el mínimo de 6 y corta en 72', () => {
    expect(registerSchema.safeParse({ ...registerBase, password: '12345' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...registerBase, password: '123456' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...registerBase, password: 'a'.repeat(72) }).success).toBe(true);
    const over = registerSchema.safeParse({ ...registerBase, password: 'a'.repeat(73) });
    expect(over.success).toBe(false);
    if (!over.success) {
      expect(over.error.errors.map((issue) => issue.message).join('; ')).toContain('72');
    }
  });

  it('el teléfono acepta 20 y rechaza 21', () => {
    const ok = registerSchema.safeParse({ ...registerBase, phone: '1'.repeat(20) });
    const over = registerSchema.safeParse({ ...registerBase, phone: '1'.repeat(21) });
    expectTooLong(ok, over, 'teléfono', 20);
  });

  it('el nombre de la mascota acepta 50 y rechaza 51', () => {
    const ok = createPatientSchema.safeParse({ ...patientBase, name: 'a'.repeat(50) });
    const over = createPatientSchema.safeParse({ ...patientBase, name: 'a'.repeat(51) });
    expectTooLong(ok, over, 'nombre de la mascota', 50);
  });

  it('el correo de la clínica acepta 254 y rechaza 255', () => {
    const ok = updateConfigSchema.safeParse({ clinicEmail: 'a'.repeat(254) });
    const over = updateConfigSchema.safeParse({ clinicEmail: 'a'.repeat(255) });
    expectTooLong(ok, over, 'correo', 254);
  });

  it('el motivo de la cita acepta 500 y rechaza 501', () => {
    const base = { patientId: 'ckpatient00000000000000001', date: '2026-10-22', time: '10:00' };
    const ok = requestAppointmentSchema.safeParse({ ...base, notes: 'a'.repeat(500) });
    const over = requestAppointmentSchema.safeParse({ ...base, notes: 'a'.repeat(501) });
    expectTooLong(ok, over, 'motivo', 500);
  });

  it('el motivo de la consulta acepta 500 y rechaza 501', () => {
    const base = { date: '2026-10-22' };
    const ok = medicalRecordSchema.safeParse({ ...base, reason: 'a'.repeat(500) });
    const over = medicalRecordSchema.safeParse({ ...base, reason: 'a'.repeat(501) });
    expectTooLong(ok, over, 'motivo', 500);
  });

  it('la descripción del recordatorio acepta 2000 y rechaza 2001', () => {
    const base = { title: 'Vacuna', date: '2026-10-22' };
    const ok = reminderSchema.safeParse({ ...base, description: 'a'.repeat(2000) });
    const over = reminderSchema.safeParse({ ...base, description: 'a'.repeat(2001) });
    expectTooLong(ok, over, 'descripción', 2000);
  });

  it('el código de paciente acepta 20 y rechaza 21', () => {
    const ok = linkPatientSchema.safeParse({ code: 'A'.repeat(20) });
    const over = linkPatientSchema.safeParse({ code: 'A'.repeat(21) });
    expectTooLong(ok, over, 'código', 20);
  });

  it('la búsqueda acepta 100 y responde 400 al carácter 101', () => {
    expect(parseOptionalSearch('a'.repeat(100))).toBe('a'.repeat(100));
    expect(() => parseOptionalSearch('a'.repeat(101))).toThrow(DomainError);
    try {
      parseOptionalSearch('a'.repeat(101));
    } catch (err) {
      const error = err as DomainError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('«búsqueda»');
      expect(error.message).toContain('100');
    }
  });

  it('el asunto acepta 150 y el mensaje 5000; uno más responde error', () => {
    const ok = clinicMessageSchema.safeParse({
      title: 'a'.repeat(150),
      body: 'b'.repeat(5000),
    });
    const titleOver = clinicMessageSchema.safeParse({
      title: 'a'.repeat(151),
      body: 'hola',
    });
    const bodyOver = clinicMessageSchema.safeParse({
      title: 'hola',
      body: 'b'.repeat(5001),
    });
    expectTooLong(ok, titleOver, 'asunto', 150);
    expect(bodyOver.success).toBe(false);
    if (!bodyOver.success) {
      const message = bodyOver.error.errors.map((issue) => issue.message).join('; ');
      expect(message).toContain('«mensaje»');
      expect(message).toContain('5000');
    }
  });

  it('el nombre de la vacuna dentro de la consulta acepta 100 y rechaza 101', () => {
    const base = { date: '2026-10-22', reason: 'Vacuna' };
    const ok = medicalRecordSchema.safeParse({
      ...base,
      typePayload: { vaccine: 'a'.repeat(100) },
    });
    const over = medicalRecordSchema.safeParse({
      ...base,
      typePayload: { vaccine: 'a'.repeat(101) },
    });
    expectTooLong(ok, over, 'vacuna', 100);
  });
});
