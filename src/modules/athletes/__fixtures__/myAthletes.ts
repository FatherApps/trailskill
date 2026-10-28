import type { MyAthleteCard } from '../screens/MyAthletesScreen';

// Synthetic athletes: fictional names, categories and groups.
export const myAthletesFixture: MyAthleteCard[] = [
  { id: 'fx-1', name: 'Paula G.', color: 'athlete-1', school: 'Escuela Delfines', group: 'Grupo A', category: 'Máster', authorized: true },
  { id: 'fx-2', name: 'Tomás R.', color: 'athlete-2', school: 'Escuela Delfines', group: 'Grupo B', category: 'Infantil A', authorized: false },
  { id: 'fx-3', name: 'Lucía R.', color: 'athlete-3' },
  { id: 'fx-4', name: 'Mateo C.', color: 'athlete-4', school: 'Escuela Delfines', group: 'Grupo B', category: 'Infantil B', authorized: true },
];

export const myAthletesLongTextFixture: MyAthleteCard[] = [
  {
    id: 'fx-5',
    name: 'María de los Ángeles P.',
    color: 'athlete-1',
    school: 'Escuela de natación de alto rendimiento del litoral',
    group: 'Grupo de la mañana de perfeccionamiento técnico',
    category: 'Categoría juvenil de desarrollo avanzado',
    authorized: false,
  },
];
