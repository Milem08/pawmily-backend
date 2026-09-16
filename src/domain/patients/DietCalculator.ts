export const DIET_FORMULA_VERSION = 'rer-mer-v1';

export interface DietInput {
  weightKg: number;
  species?: string | null;
  mealsPerDay?: number;
  activityFactor?: number;
  vetNotes?: string | null;
}

export interface DietResult {
  weightKg: number;
  caloriesPerDay: number;
  mealsPerDay: number;
  recommendedAmount: string;
  formulaVersion: string;
  vetNotes?: string | null;
  specialInstructions?: string | null;
  activityFactor: number;
}

function defaultActivityFactor(species?: string | null): number {
  const s = (species ?? '').toLowerCase();
  if (s.includes('gato') || s.includes('cat') || s.includes('felino')) {
    return 1.2;
  }
  return 1.6;
}

/** RER = 70 * weightKg^0.75; MER = RER × activityFactor */
export function calculateDiet(input: DietInput): DietResult {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    throw new Error('weightKg must be > 0');
  }

  const mealsPerDay =
    input.mealsPerDay && input.mealsPerDay > 0 ? Math.floor(input.mealsPerDay) : 2;
  const activityFactor =
    input.activityFactor && input.activityFactor > 0
      ? input.activityFactor
      : defaultActivityFactor(input.species);

  const rer = 70 * Math.pow(input.weightKg, 0.75);
  const caloriesPerDay = Math.round(rer * activityFactor);
  const kcalPerMeal = Math.round(caloriesPerDay / mealsPerDay);

  const recommendedAmount = `~${caloriesPerDay} kcal/día (~${kcalPerMeal} kcal/comida × ${mealsPerDay})`;
  const vetNotes = input.vetNotes ?? null;

  return {
    weightKg: input.weightKg,
    caloriesPerDay,
    mealsPerDay,
    recommendedAmount,
    formulaVersion: DIET_FORMULA_VERSION,
    vetNotes,
    specialInstructions: vetNotes,
    activityFactor,
  };
}
