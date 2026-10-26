// Synthetic registration data for the development gallery and tests: fictional people, school and group.
export const accountsFixture = {
  person: {
    firstName: 'Camila',
    lastName: 'Rojas',
    email: 'camila@example.test',
  },
  invitation: { school: 'Escuela Delfines', group: 'Infantil B' },
  categories: [
    { id: 'category-9-10', name: '9-10' },
    { id: 'category-11-12', name: '11-12' },
  ],
  // A six-digit code that does not match: used by the mismatch states.
  wrongCode: '482913',
  // Profiles a guardian already added (names already shortened, as the athletes module gives them).
  addedAthletes: [
    { id: 'athlete-lucia', name: 'Lucía R.', initials: 'LR', color: 'athlete-1' },
    { id: 'athlete-mateo', name: 'Mateo R.', initials: 'MR', color: 'athlete-2' },
  ],
} as const;
