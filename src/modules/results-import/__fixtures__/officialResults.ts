import type { ChangeItem, ResultItem } from '../screens/OfficialResultsScreen';

// Synthetic results: fictional competitions and times.
export const resultItemsFixture: ResultItem[] = [
  { id: 'fx-1', event: 'Libre 50 m · Piscina de 50 m', date: '14 mar 2026', competition: 'Torneo de prueba', time: 2890 },
  { id: 'fx-2', event: 'Espalda 100 m · Piscina de 25 m', date: '2 may 2026', competition: null, time: 6712 },
  { id: 'fx-3', event: 'Pecho 200 m · Piscina de 50 m', date: '9 ago 2026', competition: 'Copa ficticia', time: null },
];

export const resultItemsLongTextFixture: ResultItem[] = [
  {
    id: 'fx-4',
    event: 'Combinado individual 400 m · Piscina de 50 m',
    date: '14 mar 2026',
    competition: 'Campeonato regional de prueba de natación de categorías infantiles y juveniles',
    time: 28900,
  },
];

export const changeItemsFixture: ChangeItem[] = [
  { id: 'fx-c1', event: 'Libre 50 m · Piscina de 50 m', date: '14 mar 2026', current: 2890, proposed: 2850, busy: false, failed: false },
];

export const changeItemsFailedFixture: ChangeItem[] = [{ ...changeItemsFixture[0]!, failed: true }];
