import {
  calculateDiet,
  DIET_FORMULA_VERSION,
  DIET_LIMIT_MESSAGES,
} from '../../../src/domain/patients/DietCalculator';
import { dietSchema, feedingSchema } from '../../../src/interfaces/http/dto/schemas';

describe('calculateDiet', () => {
  it('computes calories and recommended amount for 10kg dog', () => {
    const diet = calculateDiet({ weightKg: 10, species: 'perro' });
    expect(diet.formulaVersion).toBe(DIET_FORMULA_VERSION);
    expect(diet.caloriesPerDay).toBeGreaterThan(0);
    expect(diet.recommendedAmount).toBeTruthy();
    expect(diet.recommendedAmount).toContain('kcal');
    expect(diet.mealsPerDay).toBe(2);
    expect(diet.activityFactor).toBe(1.6);
  });

  it('uses cat activity factor by default', () => {
    const diet = calculateDiet({ weightKg: 4, species: 'gato' });
    expect(diet.activityFactor).toBe(1.2);
    expect(diet.caloriesPerDay).toBeGreaterThan(0);
  });

  it('rejects invalid weight', () => {
    expect(() => calculateDiet({ weightKg: 0, species: 'perro' })).toThrow(DIET_LIMIT_MESSAGES.weight);
  });

  it('DIET-02 rechaza peso, factor y comidas fuera de rango', () => {
    expect(() =>
      calculateDiet({ weightKg: 4000, species: 'perro', mealsPerDay: 500, activityFactor: 50 }),
    ).toThrow(DIET_LIMIT_MESSAGES.weight);
    expect(dietSchema.safeParse({ weightKg: 4000, mealsPerDay: 500, activityFactor: 50 }).success).toBe(
      false,
    );
  });

  it('FEED-02 y DIET-03 rechazan 500 comidas aunque el plan traiga 2', () => {
    const parsed = feedingSchema.safeParse({
      recommendedAmount: '200 g',
      mealsPerDay: 500,
      meals: [
        { label: 'Desayuno', time: '08:00' },
        { label: 'Cena', time: '19:00' },
      ],
    });
    expect(parsed.success).toBe(false);
    expect(() => calculateDiet({ weightKg: 10, species: 'perro', mealsPerDay: 500 })).toThrow(
      DIET_LIMIT_MESSAGES.meals,
    );
  });

  it('caballo no usa la fórmula de perro', () => {
    expect(() => calculateDiet({ weightKg: 400, species: 'caballo' })).toThrow(
      DIET_LIMIT_MESSAGES.species,
    );
  });

  it('el número de comidas del plan tiene que coincidir', () => {
    const parsed = feedingSchema.safeParse({
      recommendedAmount: '200 g',
      mealsPerDay: 3,
      meals: [
        { label: 'Desayuno', time: '08:00' },
        { label: 'Cena', time: '19:00' },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
