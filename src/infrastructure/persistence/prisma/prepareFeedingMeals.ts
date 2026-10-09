import { FeedingMealInput } from '../../../domain/patients/PatientRepository';
import { DomainError } from '../../../domain/shared/DomainError';
import { canonicalMealTime, mealIdentityKey } from '../../../shared/mealTime';

export interface ExistingFeedingMeal {
  id: string;
  label: string;
  time: string;
  archivedAt?: Date | null;
}

export interface PreparedFeedingMeal {
  existingId: string | null;
  label: string;
  time: string;
  amount: string | null;
  food: string | null;
  notes: string | null;
  sortOrder: number;
}

/** Resolves meal ids and hours. Throws before any row is written. */
export function prepareFeedingMealChanges(
  existingMeals: ExistingFeedingMeal[],
  meals: FeedingMealInput[],
): { writes: PreparedFeedingMeal[]; unusedIds: string[] } {
  const used = new Set<string>();
  const writes: PreparedFeedingMeal[] = [];

  for (let i = 0; i < meals.length; i += 1) {
    const incoming = meals[i];
    const time = canonicalMealTime(incoming.time);
    if (!time) {
      throw new DomainError('Hora de comida no reconocida', 400);
    }
    const label = incoming.label.trim();
    let prev: ExistingFeedingMeal | undefined;
    if (incoming.id) {
      prev = existingMeals.find((row) => row.id === incoming.id);
      if (!prev) {
        throw new DomainError('Comida no encontrada', 400);
      }
      if (used.has(prev.id)) {
        throw new DomainError('Comida repetida en el plan', 400);
      }
    } else {
      const key = mealIdentityKey(label, time);
      prev = existingMeals.find(
        (row) => !used.has(row.id) && mealIdentityKey(row.label, row.time) === key,
      );
    }
    if (prev) used.add(prev.id);
    writes.push({
      existingId: prev?.id ?? null,
      label,
      time,
      amount: incoming.amount ?? null,
      food: incoming.food ?? null,
      notes: incoming.notes ?? null,
      sortOrder: incoming.sortOrder ?? i,
    });
  }

  const unusedIds = existingMeals
    .filter((row) => !used.has(row.id) && !row.archivedAt)
    .map((row) => row.id);
  return { writes, unusedIds };
}
