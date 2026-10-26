import type { MyAthleteCard } from '../screens/MyAthletesScreen';

// Synthetic athletes: fictional names, categories and groups.
export const myAthletesFixture: MyAthleteCard[] = [
  { id: 'fx-1', name: 'Paula G.', color: 'athlete-1', detail: 'Máster · Grupo A' },
  { id: 'fx-2', name: 'Tomás R.', color: 'athlete-2', detail: 'Infantil A · Grupo B' },
  { id: 'fx-3', name: 'Lucía R.', color: 'athlete-3' },
  { id: 'fx-4', name: 'Mateo C.', color: 'athlete-4', detail: 'Infantil B · Grupo B' },
];

export const myAthletesLongTextFixture: MyAthleteCard[] = [
  {
    id: 'fx-5',
    name: 'María de los Ángeles P.',
    color: 'athlete-1',
    detail: 'Categoría juvenil de desarrollo avanzado · Grupo de la mañana de perfeccionamiento técnico',
  },
];
