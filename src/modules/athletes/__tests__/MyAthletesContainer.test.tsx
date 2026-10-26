import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryManagedAthleteRepository } from '../../accounts';
import { createInMemorySchoolStructureRepository } from '../../school-console';
import { ThemeProvider } from '../../../core/theme';
import { createInMemoryAthleteSchoolRepository, createInMemorySchoolAthleteRepository, MyAthletesContainer } from '..';

jest.mock('../../../core/sync', () => ({ db: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic data only.
const athletes = createInMemorySchoolAthleteRepository({
  athletes: [
    { id: 'a1', firstName: 'Ana', lastName: 'Marin' },
    { id: 'a2', firstName: 'Ben', lastName: 'Arce' },
    { id: 'a3', firstName: 'Cleo', lastName: 'Other' },
  ],
  athleteSchools: [],
  athleteGroups: [
    { athleteId: 'a1', groupId: 'g1' },
    { athleteId: 'a3', groupId: 'g1' },
  ],
});
const schoolLinks = createInMemoryAthleteSchoolRepository([{ athleteId: 'a1', schoolId: 'delfines', categoryId: 'infantil' }]);
const structure = createInMemorySchoolStructureRepository({
  categories: [{ id: 'infantil', schoolId: 'delfines', name: 'Infantil B', sortOrder: 0 }],
  groups: [{ id: 'g1', schoolId: 'delfines', name: 'Grupo A' }],
  groupAssignments: [],
  athleteAssignments: [],
  coachMemberships: [],
});
const managed = createInMemoryManagedAthleteRepository([
  { userId: 'guardian-1', athleteId: 'a1' },
  { userId: 'guardian-1', athleteId: 'a2' },
]);

const show = (userId: string | undefined, onOpen = jest.fn(), repository: typeof managed = managed) =>
  render(
    <ThemeProvider>
      <MyAthletesContainer
        userId={userId}
        managed={repository}
        athletes={athletes}
        schoolLinks={schoolLinks}
        structure={structure}
        onOpen={onOpen}
        scrollEnabled={false}
      />
    </ThemeProvider>,
  );

describe('MyAthletesContainer', () => {
  it('shows a card for each managed athlete and none for another guardian’s', async () => {
    await show('guardian-1');

    expect(await screen.findByText('Ben A.')).toBeOnTheScreen();
    expect(screen.getByText('Ana M.')).toBeOnTheScreen();
    expect(screen.queryByText('Cleo O.')).toBeNull();
  });

  it('shows the category and group of the athlete when the device knows them', async () => {
    await show('guardian-1');

    expect(await screen.findByText('Infantil B · Grupo A')).toBeOnTheScreen();
  });

  it('opens the athlete profile id when a card is pressed', async () => {
    const onOpen = jest.fn();
    await show('guardian-1', onOpen);

    await fireEvent.press(await screen.findByRole('button', { name: 'Ana M.' }));

    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('shows the empty state for a user who manages nobody', async () => {
    await show('coach-1');

    expect(await screen.findByText('Aún no hay deportistas')).toBeOnTheScreen();
  });

  it('shows no card while the managed athletes are loading', async () => {
    await show('guardian-1', jest.fn(), { listManagedAthleteIds: () => new Promise<string[]>(() => {}) } as typeof managed);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Aún no hay deportistas')).toBeNull();
  });

  it('still shows the cards when the category lookup fails', async () => {
    const broken = { ...structure, listCategories: () => Promise.reject(new Error('offline')) };
    await render(
      <ThemeProvider>
        <MyAthletesContainer
          userId="guardian-1"
          managed={managed}
          athletes={athletes}
          schoolLinks={schoolLinks}
          structure={broken}
          onOpen={jest.fn()}
          scrollEnabled={false}
        />
      </ThemeProvider>,
    );

    expect(await screen.findByText('Ana M.')).toBeOnTheScreen();
  });
});
