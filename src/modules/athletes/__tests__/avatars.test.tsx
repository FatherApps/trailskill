import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider } from '../../../core/theme';
import type { AthleteAvatarSlot } from '../../../core/ui';
import { createInMemoryAuthorizationStatusRepository, createInMemoryManagedAthleteRepository } from '../../accounts';
import { createInMemorySchoolNameRepository, createInMemorySchoolStructureRepository } from '../../school-console';
import {
  AthleteProfileScreen,
  createInMemoryAthleteSchoolRepository,
  createInMemoryHistoryRepository,
  createInMemorySchoolAthleteRepository,
  MarksContainer,
  MyAthletesContainer,
  ProfileHeader,
} from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only. The route injects the avatar that reads the photo; here a fake one says what it was asked for.
const Avatar: AthleteAvatarSlot = ({ athleteId, initials, color, size }) => <Text>{`avatar ${athleteId} ${initials} ${color} ${size}`}</Text>;

const athletes = createInMemorySchoolAthleteRepository({
  athletes: [
    { id: 'a1', firstName: 'Ana', lastName: 'Marin' },
    { id: 'a2', firstName: 'Ben', lastName: 'Arce' },
  ],
  athleteSchools: [],
  athleteGroups: [],
});
const managed = createInMemoryManagedAthleteRepository([
  { userId: 'guardian-1', athleteId: 'a1', relation: 'self' },
  { userId: 'guardian-1', athleteId: 'a2', relation: 'guardian' },
]);

describe('the athlete avatar in the athletes module', () => {
  it('the card in front of My athletes shows the lg avatar of that athlete only', async () => {
    await render(
      <ThemeProvider>
        <MyAthletesContainer
          userId="guardian-1"
          managed={managed}
          athletes={athletes}
          schoolLinks={createInMemoryAthleteSchoolRepository([])}
          schoolNames={createInMemorySchoolNameRepository([])}
          structure={createInMemorySchoolStructureRepository({ categories: [], groups: [], groupAssignments: [], athleteAssignments: [], coachMemberships: [] })}
          authorizations={createInMemoryAuthorizationStatusRepository([])}
          onOpen={jest.fn()}
          onAdd={jest.fn()}
          scrollEnabled={false}
          Avatar={Avatar}
        />
      </ThemeProvider>,
    );

    const front = await screen.findByText(/^avatar a1 AM athlete-\d lg$/);
    expect(front).toBeOnTheScreen();
    expect(screen.queryByText(/^avatar a2/)).toBeNull();
  });

  it('the athlete chips of Marcas carry the sm avatar of each athlete', async () => {
    await render(
      <ThemeProvider>
        <MarksContainer
          userId="guardian-1"
          managed={managed}
          athletes={athletes}
          history={createInMemoryHistoryRepository([])}
          scrollEnabled={false}
          Avatar={Avatar}
        />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/^avatar a\d [A-Z]{2} athlete-\d sm$/, { includeHiddenElements: true })).toHaveLength(2));
  });

  it('without an injected avatar they show the initials, not an avatar of the route', async () => {
    await render(
      <ThemeProvider>
        <MarksContainer userId="guardian-1" managed={managed} athletes={athletes} history={createInMemoryHistoryRepository([])} scrollEnabled={false} />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getAllByText('AM', { includeHiddenElements: true }).length).toBeGreaterThan(0));
    expect(screen.queryByText(/^avatar /, { includeHiddenElements: true })).toBeNull();
  });

  it('the profile header draws the lg avatar before the name, in the band and in the loading state', async () => {
    const header = {
      name: 'Ana Marin',
      category: 'Infantil B',
      schools: [{ id: 's1', name: 'Delfines' }],
      schoolId: 's1',
      authorization: 'valid' as const,
      updatedMinutesAgo: 1,
      avatar: <Text>lg avatar</Text>,
    };
    const { rerender } = await render(
      <ThemeProvider>
        <ProfileHeader {...header} />
      </ThemeProvider>,
    );
    expect(screen.getByText('lg avatar')).toBeOnTheScreen();

    await rerender(
      <ThemeProvider>
        <AthleteProfileScreen name="Ana Marin" view={{ kind: 'loading', header: { color: 'athlete-1', avatar: <Text>lg avatar</Text> } }} scrollEnabled={false} />
      </ThemeProvider>,
    );
    expect(screen.getByText('lg avatar')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Ana Marin' })).toBeOnTheScreen();
  });
});
