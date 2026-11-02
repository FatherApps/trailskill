import type { HistoryResult } from '../components/HistoryList';

// Synthetic: a fictional athlete's Libre 50 m between May and October 2026. Times are in hundredths of a second.
export const progressChartToday = '2026-10-24';

const base = { stroke: 'FR', distance: '50m', value: { kind: 'race' }, origin: 'own' } as const;

export const progressChartResults: HistoryResult[] = [
  { ...base, id: 'p1', date: '2026-05-12', context: 'training', value: { kind: 'repetition', index: 1 }, time: 3710 },
  { ...base, id: 'p2', date: '2026-06-20', context: 'training', value: { kind: 'repetition', index: 2 }, time: 3640 },
  { ...base, id: 'p3', date: '2026-07-18', context: 'competition', origin: 'import', sourceName: 'FEDNAT', time: 3590 },
  { ...base, id: 'p4', date: '2026-08-22', context: 'training', value: { kind: 'repetition', index: 1 }, time: 3560 },
  { ...base, id: 'p5', date: '2026-09-12', context: 'competition', origin: 'external_timer', time: 3530 },
  { ...base, id: 'p6', date: '2026-10-05', context: 'training', value: { kind: 'repetition', index: 3 }, time: 3573 },
  { ...base, id: 'p7', date: '2026-10-18', context: 'competition', time: 3482, isPersonalBest: true },
];

export const progressChartTwoResults = progressChartResults.slice(5);
export const progressChartOneResult = progressChartResults.slice(6);

// Completed without a time, and a time that is null: neither is drawn.
export const progressChartWithoutTime: HistoryResult[] = [
  ...progressChartResults,
  { ...base, id: 'no-time', date: '2026-10-20', context: 'training', time: null, completed: true },
  { ...base, id: 'null-time', date: '2026-10-21', context: 'competition', time: null },
];

// A series total is not a time of the event, so it stays out of the chart.
export const progressChartWithSeriesTotal: HistoryResult[] = [
  ...progressChartResults,
  { ...base, id: 'total', date: '2026-10-22', context: 'training', value: { kind: 'series_total' }, time: 15380 },
];

// A long event: minutes in the axis labels.
export const progressChartMinutes: HistoryResult[] = [
  { ...base, id: 'm1', distance: '200m', date: '2026-06-02', context: 'competition', time: 15380 },
  { ...base, id: 'm2', distance: '200m', date: '2026-08-14', context: 'competition', time: 15120 },
  { ...base, id: 'm3', distance: '200m', date: '2026-10-10', context: 'competition', time: 14890, isPersonalBest: true },
];
