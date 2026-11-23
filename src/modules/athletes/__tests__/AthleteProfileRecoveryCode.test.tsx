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

// Same rule for the owner's switch per school: only the route decides who gets it, so staff, coaches and other families never see it.
describe('AthleteProfileScreen result sharing slot', () => {
  it('shows the switch where the route puts it', async () => {
    await render(<AthleteProfileScreen name="Ana" view={{ kind: 'data', content: { ...content, resultSharing: <Text>sharing row</Text> } }} />);

    expect(screen.getByText('sharing row')).toBeTruthy();
  });

  it('shows nothing when the route passes none', async () => {
    await render(<AthleteProfileScreen name="Ana" view={{ kind: 'data', content }} />);

    expect(screen.queryByText('sharing row')).toBeNull();
  });
});
