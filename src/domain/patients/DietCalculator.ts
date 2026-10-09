import { DomainError } from '../shared/DomainError';
import { normalizeSpecies } from './speciesCatalog';

export const DIET_FORMULA_VERSION = 'rer-mer-v1';

export const DIET_LIMITS = {
  weightKgMin: 0.1,
  weightKgMax: 200,
  activityFactorMin: 0.5,
  activityFactorMax: 5,
  mealsPerDayMin: 1,
  mealsPerDayMax: 8,
} as const;

export const DIET_LIMIT_MESSAGES = {
  weight: 'El peso debe estar entre 0.1 y 200 kg',
  activity: 'El factor de actividad debe estar entre 0.5 y 5',
  meals: 'Las comidas al día deben ser un entero entre 1 y 8',
  mealsMismatch: 'El número de comidas al día no coincide con las comidas del plan',
  species: 'Especie no soportada por la calculadora',
} as const;

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

function dietKind(species?: string | null): 'dog' | 'cat' | null {
  const key = normalizeSpecies(species ?? '');
  if (!key) return null;
  if (key.includes('GATO') || key.includes('CAT') || key.includes('FELINO')) return 'cat';
  if (key.includes('PERRO') || key.includes('DOG') || key.includes('CANINO')) return 'dog';
  return null;
}

function activityForSpecies(species?: string | null): number {
  const kind = dietKind(species);
  if (kind === 'cat') return 1.2;
  if (kind === 'dog') return 1.6;
  throw new DomainError(DIET_LIMIT_MESSAGES.species, 400);
}

/**
 * RER = 70 * weightKg^0.75; MER = RER × activityFactor.
 * Pendiente: el objetivo clínico (control_peso, mantenimiento, …) no ajusta las kcal;
 * no hay factores clínicos definidos para este proyecto.
 */
export function calculateDiet(input: DietInput): DietResult {
  if (!dietKind(input.species)) {
    throw new DomainError(DIET_LIMIT_MESSAGES.species, 400);
  }
  if (
    !Number.isFinite(input.weightKg) ||
    input.weightKg < DIET_LIMITS.weightKgMin ||
    input.weightKg > DIET_LIMITS.weightKgMax
  ) {
    throw new DomainError(DIET_LIMIT_MESSAGES.weight, 400);
  }

  const mealsPerDay = input.mealsPerDay ?? 2;
  if (
    !Number.isInteger(mealsPerDay) ||
    mealsPerDay < DIET_LIMITS.mealsPerDayMin ||
    mealsPerDay > DIET_LIMITS.mealsPerDayMax
  ) {
    throw new DomainError(DIET_LIMIT_MESSAGES.meals, 400);
  }

  if (
    input.activityFactor != null &&
    (!Number.isFinite(input.activityFactor) ||
      input.activityFactor < DIET_LIMITS.activityFactorMin ||
      input.activityFactor > DIET_LIMITS.activityFactorMax)
  ) {
    throw new DomainError(DIET_LIMIT_MESSAGES.activity, 400);
  }

  const activityFactor = input.activityFactor ?? activityForSpecies(input.species);

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
