import type { HomeContent } from '../screens/HomeScreen';
import { plansFixture } from './plans';

// A week as the mockup draws it: Monday 19 to Sunday 25 October, today being Saturday 24. Synthetic: no real school or person.
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const week = weekdays.map((weekday, index) => ({ day: `2026-10-${19 + index}`, weekday, date: 19 + index, today: index === 5 }));

const content: HomeContent = {
  schoolName: 'Escuela de ejemplo',
  week,
  next: { athleteId: 'a1', athleteName: 'Lucía R.', title: 'Toma de tiempos', whenLabel: 'Hoy', color: 'athlete-1' },
  marks: [
    { id: 'm1', athleteName: 'Lucía R.', event: 'Libre 50 m', detail: 'Jueves · Entrenamiento', hundredths: 3482, color: 'athlete-1' },
    { id: 'm2', athleteName: 'Tomás R.', event: 'Espalda 100 m', detail: 'Miércoles · Competencia', hundredths: 8915, color: 'athlete-2' },
  ],
};

export const homeFixture = {
  greetingName: 'Paula',
  athletes: plansFixture.athletes,
  content,
  noUpcoming: { ...content, next: null },
  nothing: { ...content, next: null, marks: [] },
};
