import { athleteDisplay } from '../athleteDisplay';

describe('athleteDisplay', () => {
  it('shortens the name to the first name and the initial of the last name', () => {
    expect(athleteDisplay({ firstName: 'Mateo', lastName: 'Cano Ruiz' }, 0)).toMatchObject({ shortName: 'Mateo C.', initials: 'MC' });
  });

  it('keeps the first name alone when there is no last name', () => {
    expect(athleteDisplay({ firstName: 'Mateo', lastName: '' }, 0)).toMatchObject({ shortName: 'Mateo', initials: 'M' });
  });

  it('cycles the four athlete colours by position', () => {
    const colors = [0, 1, 2, 3, 4].map((i) => athleteDisplay({ firstName: 'A', lastName: 'B' }, i).color);

    expect(colors).toEqual(['athlete-1', 'athlete-2', 'athlete-3', 'athlete-4', 'athlete-1']);
  });
});
