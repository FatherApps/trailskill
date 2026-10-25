import { eventLabel, personalBestLabel } from '../components/eventLabel';

describe('eventLabel', () => {
  it('builds the event from the sport catalogs', () => {
    expect(eventLabel('FR', '50m')).toBe('Libre 50');
    expect(eventLabel('BK', '200m')).toBe('Espalda 200');
  });

  it('keeps an unknown code visible instead of hiding it', () => {
    expect(eventLabel('XX', '50m')).toBe('XX 50');
    expect(eventLabel('FR', '75m')).toBe('Libre 75m');
  });

  it('names the personal best column of an event', () => {
    expect(personalBestLabel('FR', '50m')).toBe('MP Libre 50');
  });
});
