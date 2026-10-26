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

  it('names the pool in the personal best column when it is given', () => {
    expect(personalBestLabel('FR', '50m', 'SCM')).toBe('MP Libre 50 · 25 m');
    expect(personalBestLabel('FR', '50m', 'LCM')).toBe('MP Libre 50 · 50 m');
  });

  it('keeps an unknown pool code visible', () => {
    expect(personalBestLabel('FR', '50m', 'XX')).toBe('MP Libre 50 · XX');
  });
});
