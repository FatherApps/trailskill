import { render, screen } from '@testing-library/react-native';

import Home from '../app/(app)/index';
import { t } from '../core/i18n';

// Lives outside src/app: Expo Router would treat a test file there as a route.
describe('home screen', () => {
  it('shows the app title', async () => {
    await render(<Home />);

    expect(screen.getByText('TrailSkill')).toBeTruthy();
  });
});

describe('t', () => {
  it('returns the es-CO text of a known key', () => {
    expect(t('home.title')).toBe('TrailSkill');
  });

  it('returns the key itself when the translation is missing', () => {
    expect(t('home.missing')).toBe('home.missing');
  });
});
