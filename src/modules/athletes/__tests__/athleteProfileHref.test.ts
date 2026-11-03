import { athleteProfileHref } from '../athleteProfileHref';

describe('athleteProfileHref', () => {
  it('carries only the name next to the id, trimmed and encoded', () => {
    expect(athleteProfileHref('a1', ' María Pérez ')).toBe('/athletes/a1?name=Mar%C3%ADa%20P%C3%A9rez');
  });

  it('has no name in the route when the name is blank', () => {
    expect(athleteProfileHref('a1', '  ')).toBe('/athletes/a1');
  });
});
