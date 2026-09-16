import { calculateDiet, DIET_FORMULA_VERSION } from '../../../src/domain/patients/DietCalculator';

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
    expect(() => calculateDiet({ weightKg: 0 })).toThrow();
  });
});
