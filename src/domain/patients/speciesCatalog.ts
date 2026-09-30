const WITH_BREED = [
  'Perro',
  'Gato',
  'Caballo',
  'Conejo',
  'Hámster',
  'Cobayo',
  'Hurón',
  'Loro',
  'Canario',
  'Periquito',
  'Gallina',
  'Pato',
  'Vaca',
  'Cerdo',
  'Oveja',
  'Cabra',
];

export function normalizeSpecies(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

const breedKeys = new Set(WITH_BREED.map(normalizeSpecies));

export function speciesRequiresBreed(species: string | undefined | null): boolean {
  if (!species) return false;
  return breedKeys.has(normalizeSpecies(species));
}
