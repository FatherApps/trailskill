import { athleteDisplay } from '../athleteDisplay';

const athlete = (id: string, firstName = 'A', lastName = 'B') => ({ id, firstName, lastName });

describe('athleteDisplay', () => {
  it('shortens the name to the first name and the initial of the last name', () => {
    expect(athleteDisplay(athlete('a', 'Mateo', 'Cano Ruiz'))).toMatchObject({ shortName: 'Mateo C.', initials: 'MC' });
  });

  it('keeps the first name alone when there is no last name', () => {
    expect(athleteDisplay(athlete('a', 'Mateo', ''))).toMatchObject({ shortName: 'Mateo', initials: 'M' });
  });

  it('gives the same athlete the same colour every time, whatever the name', () => {
    const first = athleteDisplay(athlete('swimmer-17', 'Lucía', 'Ramírez')).color;

    expect(athleteDisplay(athlete('swimmer-17', 'Lucía', 'Ramírez')).color).toBe(first);
    expect(athleteDisplay(athlete('swimmer-17', 'Otro', 'Nombre')).color).toBe(first);
  });

  it('spreads different ids over the four athlete colours', () => {
    const colors = ['a', 'b', 'c', 'd'].map((id) => athleteDisplay(athlete(id)).color);

    expect(new Set(colors).size).toBe(4);
    expect([...colors].sort()).toEqual(['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4']);
  });

  // The school console picks the colour with the same rule (sum of the id's characters modulo four): an athlete keeps the colour on phone and tablet.
  it('uses the same colour rule as the school console', () => {
    expect(['a', 'b', 'c', 'd'].map((id) => athleteDisplay(athlete(id)).color)).toEqual([
      'athlete-2',
      'athlete-3',
      'athlete-4',
      'athlete-1',
    ]);
  });
});
