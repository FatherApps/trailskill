import { personalBestDifference, spokenDifference, spokenTime } from '..';

// Rules: minutes and seconds are joined with ", "; hundredths follow with " con "; a zero part is omitted;
// each unit is singular only for exactly 1; a time of 0 is "0 centésimas".
describe('spokenTime', () => {
  it.each([
    [7240, '1 minuto, 12 segundos con 40 centésimas'],
    [3482, '34 segundos con 82 centésimas'],
    [6000, '1 minuto'],
    [12000, '2 minutos'],
    [5, '5 centésimas'],
    [1, '1 centésima'],
    [100, '1 segundo'],
    [200, '2 segundos'],
    [6005, '1 minuto con 5 centésimas'],
    [6100, '1 minuto, 1 segundo'],
    [105, '1 segundo con 5 centésimas'],
    [91, '91 centésimas'],
    [0, '0 centésimas'],
  ])('says %i as "%s"', (value, spoken) => {
    expect(spokenTime(value)).toBe(spoken);
  });
});

describe('personalBestDifference', () => {
  it('is negative when faster and positive when slower', () => {
    expect(personalBestDifference(3391, 3482)).toBe(-91);
    expect(personalBestDifference(3522, 3482)).toBe(40);
  });

  it.each([
    [3482, 3482],
    [3482, null],
    [3482, undefined],
    [null, 3482],
  ])('is null for %s against %s', (value, best) => {
    expect(personalBestDifference(value, best)).toBeNull();
  });
});

describe('spokenDifference', () => {
  it('says how much faster or slower', () => {
    expect(spokenDifference(-91)).toBe('91 centésimas menos que la marca personal');
    expect(spokenDifference(105)).toBe('1 segundo con 5 centésimas más que la marca personal');
  });
});
