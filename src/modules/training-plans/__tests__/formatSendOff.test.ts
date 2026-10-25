import { formatSendOff } from '../components/formatSendOff';

describe('formatSendOff', () => {
  it.each([
    [45, '0:45'],
    [60, '1:00'],
    [90, '1:30'],
    [605, '10:05'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatSendOff(seconds)).toBe(text);
  });
});
