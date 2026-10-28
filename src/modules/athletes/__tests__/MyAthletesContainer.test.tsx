import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository, createInMemoryManagedAthleteRepository } from '../../accounts';
import { createInMemorySchoolNameRepository, createInMemorySchoolStructureRepository } from '../../school-console';
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
const schoolNames = createInMemorySchoolNameRepository([{ id: 'delfines', name: 'Delfines' }]);
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
// Ana's authorization to record times is in force; Ben never answered; Cleo's is not Ben's or Ana's business.
const authorizations = createInMemoryAuthorizationStatusRepository([
  { athleteId: 'a1', purpose: 'record_times', isGranted: true },
  { athleteId: 'a2', purpose: 'record_times', isGranted: false },
  { athleteId: 'a1', purpose: 'import_official_results', isGranted: false },
]);

const show = (userId: string | undefined, props: Partial<Parameters<typeof MyAthletesContainer>[0]> = {}) =>
  render(
    <ThemeProvider>
      <MyAthletesContainer
        userId={userId}
        managed={managed}
        athletes={athletes}
        schoolLinks={schoolLinks}
        schoolNames={schoolNames}
        structure={structure}
        authorizations={authorizations}
        onOpen={jest.fn()}
        onAdd={jest.fn()}
        scrollEnabled={false}
        {...props}
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

  it('shows the school and group, and the category, of the athlete when the device knows them', async () => {
    await show('guardian-1');

    expect(await screen.findByText('Delfines · Grupo A')).toBeOnTheScreen();
    expect(screen.getByText('Infantil B')).toBeOnTheScreen();
  });

  it('tags each athlete by the authorization to record times that the device holds', async () => {
    await show('guardian-1');

    expect(await screen.findByRole('text', { name: 'Autorizado' })).toBeOnTheScreen();
    expect(screen.getAllByRole('text', { name: 'Autorizado' })).toHaveLength(1);
    expect(screen.getAllByRole('text', { name: 'Autorización pendiente' })).toHaveLength(1);
  });

  it('shows no authorization tag while it is not read, and none when the read fails', async () => {
    const failing = { ...authorizations, listGrantedAthleteIds: () => Promise.reject(new Error('offline')) };
    await show('guardian-1', { authorizations: failing });

    expect(await screen.findByText('Ana M.')).toBeOnTheScreen();
    expect(screen.queryByRole('text', { name: 'Autorizado' })).toBeNull();
    expect(screen.queryByRole('text', { name: 'Autorización pendiente' })).toBeNull();
  });

  it('opens the athlete profile id when "Historial" is pressed', async () => {
    const onOpen = jest.fn();
    await show('guardian-1', { onOpen });

    await fireEvent.press((await screen.findAllByRole('button', { name: 'Historial' }))[0]!);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0]![0]).toMatch(/^a[12]$/);
  });

  it('asks to add an athlete', async () => {
    const onAdd = jest.fn();
    await show('guardian-1', { onAdd });

    await fireEvent.press(await screen.findByRole('button', { name: 'Agregar deportista' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state for a user who manages nobody', async () => {
    await show('coach-1');

    expect(await screen.findByText('Aún no hay deportistas')).toBeOnTheScreen();
  });

  it('shows no card while the managed athletes are loading', async () => {
    await show('guardian-1', {
      managed: { listManagedAthleteIds: () => new Promise<string[]>(() => {}), getSelfAthleteId: async () => null },
    });

    expect(screen.queryByRole('button', { name: 'Historial' })).toBeNull();
    expect(screen.queryByText('Aún no hay deportistas')).toBeNull();
  });

  it('still shows the cards when the category lookup fails', async () => {
    await show('guardian-1', { structure: { ...structure, listCategories: () => Promise.reject(new Error('offline')) } });

    expect(await screen.findByText('Ana M.')).toBeOnTheScreen();
  });

  it('still shows the cards when the school name lookup fails', async () => {
    await show('guardian-1', { schoolNames: { listByIds: () => Promise.reject(new Error('offline')) } });

    expect(await screen.findByText('Ana M.')).toBeOnTheScreen();
    expect(await screen.findByText('Grupo A')).toBeOnTheScreen();
  });
});
