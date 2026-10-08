import { DomainError } from '../../../src/domain/shared/DomainError';
import { prepareFeedingMealChanges } from '../../../src/infrastructure/persistence/prisma/prepareFeedingMeals';

const existing = [
  { id: 'desayuno', label: 'Desayuno', time: '08:00', archivedAt: null },
  { id: 'cena', label: 'Cena', time: '19:00', archivedAt: null },
];

describe('prepareFeedingMealChanges', () => {
  it('rechaza un id que no está en el plan', () => {
    expect(() =>
      prepareFeedingMealChanges(existing, [
        { id: 'desayuno', label: 'Cambiado', time: '08:00' },
        { id: 'fm_no_existe', label: 'Fantasma', time: '19:00' },
      ]),
    ).toThrow(DomainError);
    expect(() =>
      prepareFeedingMealChanges(existing, [{ id: 'fm_no_existe', label: 'Fantasma', time: '19:00' }]),
    ).toThrow(/Comida no encontrada/);
  });

  it('rechaza una hora ilegible y un id repetido', () => {
    expect(() =>
      prepareFeedingMealChanges(existing, [{ id: 'desayuno', label: 'Desayuno', time: 'xx' }]),
    ).toThrow(/no reconocida/);
    expect(() =>
      prepareFeedingMealChanges(existing, [
        { id: 'desayuno', label: 'Desayuno', time: '08:00' },
        { id: 'desayuno', label: 'Otra', time: '09:00' },
      ]),
    ).toThrow(/repetida/);
  });

  it('empareja por nombre y hora cuando no viene id', () => {
    const prepared = prepareFeedingMealChanges(existing, [
      { label: 'Cena', time: '19:00' },
    ]);
    expect(prepared.writes).toEqual([
      expect.objectContaining({ existingId: 'cena', label: 'Cena', time: '19:00' }),
    ]);
    expect(prepared.unusedIds).toEqual(['desayuno']);
  });
});
