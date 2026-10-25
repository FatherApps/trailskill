import { render, screen } from '@testing-library/react-native';

import Home from '../app/(app)/index';

// Lives outside src/app: Expo Router would treat a test file there as a route.
describe('home screen', () => {
  it('shows the app title', async () => {
    await render(<Home />);

    expect(screen.getByText('TrailSkill')).toBeTruthy();
  });
});
