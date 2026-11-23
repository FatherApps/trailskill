import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { profileContentFixture as content } from '../__fixtures__/screen';
import { AthleteProfileScreen } from '../screens/AthleteProfileScreen';

jest.mock('../../../core/sync', () => ({ supabase: {}, db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// The row is a slot the route fills only for who manages the swimmer: without it (school staff, coach, another family) nothing shows.
describe('AthleteProfileScreen recovery code slot', () => {
  it('shows the owner row where the route puts it', async () => {
    await render(<AthleteProfileScreen name="Ana" view={{ kind: 'data', content: { ...content, recoveryCode: <Text>owner row</Text> } }} />);

    expect(screen.getByText('owner row')).toBeTruthy();
  });

  it('shows no row when the route passes none', async () => {
    await render(<AthleteProfileScreen name="Ana" view={{ kind: 'data', content }} />);

    expect(screen.queryByText('owner row')).toBeNull();
    expect(screen.queryByText('Código principal')).toBeNull();
  });
});
