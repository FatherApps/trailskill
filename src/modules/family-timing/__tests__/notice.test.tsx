import { render, screen } from '@testing-library/react-native';

import { createInMemoryPreferencesRepository, defaultPreferences, PreferencesProvider } from '../../../core/preferences';
import { createInMemoryFamilyMeasurementRepository } from '../data/familyMeasurements';
import { createInMemoryFamilyTimingNoticeStore } from '../data/noticeSeen';
import { FamilyTimingContainer } from '../screens/FamilyTimingContainer';

jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useRecordSyncStates: () => new Map() }));

const athletes = [
  {
    id: 'a1',
    firstName: 'Lucía',
    lastName: 'Rojas',
    categoryId: null,
    groupIds: [],
    endedAt: null,
  },
];
const NOTICE = /^Estos tiempos son tuyos/;

async function open(notice: ReturnType<typeof createInMemoryFamilyTimingNoticeStore>) {
  const view = await render(
    <PreferencesProvider repository={createInMemoryPreferencesRepository(defaultPreferences)}>
      <FamilyTimingContainer
        userId="u1"
        athletes={athletes}
        repository={createInMemoryFamilyMeasurementRepository()}
        notice={notice}
        onBack={jest.fn()}
      />
    </PreferencesProvider>,
  );
  await screen.findByText('Medir un tiempo');
  return view;
}

describe('the notice of Mis tiempos', () => {
  it('shows on the first visit only', async () => {
    const notice = createInMemoryFamilyTimingNoticeStore();
    const first = await open(notice);
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(notice.seenBy.has('u1')).toBe(true);
    await first.unmount();

    await open(notice);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('does not show to someone who already saw it', async () => {
    await open(createInMemoryFamilyTimingNoticeStore(['u1']));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
