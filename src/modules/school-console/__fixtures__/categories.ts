import type { Category } from '../data/categories';

// Synthetic data for the development gallery and the tests: generic names, no real category or organization.
export const categoriesFixture: Category[] = [
  { id: 'c1', schoolId: 'school-1', name: 'Categoría A', sortOrder: 0, active: true },
  { id: 'c2', schoolId: 'school-1', name: 'Categoría B', sortOrder: 1, active: true },
  { id: 'c3', schoolId: 'school-1', name: 'Categoría C', sortOrder: 2, active: false },
];

export const longNameCategoriesFixture: Category[] = [
  {
    id: 'c4',
    schoolId: 'school-1',
    name: 'Categoría de desarrollo y perfeccionamiento técnico para nadadores de iniciación avanzada',
    sortOrder: 0,
    active: true,
  },
  { id: 'c5', schoolId: 'school-1', name: 'Categoría B', sortOrder: 1, active: false },
];
