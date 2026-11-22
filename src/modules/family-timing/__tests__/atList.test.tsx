import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository } from '../data/familyMeasurements';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';
import { useFamilyTimingAtList } from '../screens/familyTimingAtList';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));

// Shows what the hook says, so the test reads it from the screen.
function Probe() {
  return <Text>{useFamilyTimingAtList() ? 'at list' : 'away'}</Text>;
}

const athletes = [{ id: 'a1', firstName: 'Lucía', lastName: 'Rojas', categoryId: null, groupIds: [], endedAt: null }];

// The phone bar reads this to show only on the list of "Mis tiempos" (issue #999).
describe('whether Mis tiempos is on its list', () => {
  it('is true on the list, false while a time is measured, and true again once the screen closes', async () => {
    const view = await render(
      <PreferencesProvider repository={createInMemoryPreferencesRepository(defaultPreferences)}>
        <FamilyTimingContainer userId="u1" athletes={athletes} repository={createInMemoryFamilyMeasurementRepository()} onBack={jest.fn()} />
        <Probe />
      </PreferencesProvider>,
    );
    await screen.findByText('Aún no hay tiempos');
    expect(screen.getByText('at list')).toBeTruthy();

    await fireEvent.press(screen.getByText('Medir un tiempo'));
    expect(screen.getByText('away')).toBeTruthy();

    await view.rerender(
      <PreferencesProvider repository={createInMemoryPreferencesRepository(defaultPreferences)}>
        <Probe />
      </PreferencesProvider>,
    );
    expect(screen.getByText('at list')).toBeTruthy();
  });
});
