// Synthetic registration data for the development gallery and tests: fictional people, school and group.
export const accountsFixture = {
  person: {
    firstName: 'Camila',
    lastName: 'Rojas',
    email: 'camila@example.test',
  },
  invitation: { school: 'Escuela Delfines', group: 'Infantil B' },
  // A six-digit code that does not match: used by the mismatch states.
  wrongCode: '482913',
} as const;
