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
  // Ana is the adult themselves, so hers is the card in front; Ben is their child.
  { userId: 'guardian-1', athleteId: 'a1', relation: 'self' },
  { userId: 'guardian-1', athleteId: 'a2', relation: 'guardian' },
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

    // The first athlete is in front with the full name, the other one is collapsed.
    expect(await screen.findByText('Ben A.')).toBeOnTheScreen();
    expect(screen.getByText('Ana\nMarin')).toBeOnTheScreen();
    expect(screen.queryByText('Cleo O.')).toBeNull();
  });

  it('shows the school and group, and the category, of the athlete in front when the device knows them', async () => {
    await show('guardian-1');

    expect(await screen.findByText('Delfines · Grupo A')).toBeOnTheScreen();
    expect(screen.getByText('INFANTIL B')).toBeOnTheScreen();
    expect(screen.getByText('Ana\nMarin')).toBeOnTheScreen();
  });

  it('puts the athlete the user is first, in front, and labels the card "tú" once it is collapsed', async () => {
    const withSelf = createInMemoryManagedAthleteRepository([
      { userId: 'adult-1', athleteId: 'a1', relation: 'guardian' },
      { userId: 'adult-1', athleteId: 'a2', relation: 'self' },
    ]);
    await show('adult-1', { managed: withSelf });

    expect((await screen.findByRole('button', { name: 'Historial' })).props.accessibilityHint).toBe('Abre el perfil de Ben A.');
    expect(screen.getByText('Ana M.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Ana M\./ }));
    expect(screen.getByText('Ben A. · tú')).toBeOnTheScreen();
  });

  it('tags each athlete by the authorization to record times that the device holds', async () => {
    await show('guardian-1');

    // Ana is in front and authorized; Ben, collapsed, has not answered.
    expect(await screen.findByRole('text', { name: 'Autorizado' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /^Ben A\./ }));
    expect(screen.getByRole('text', { name: 'Autorización pendiente' })).toBeOnTheScreen();
  });

  it('shows no authorization tag while it is not read, and none when the read fails', async () => {
    const failing = { ...authorizations, listGrantedAthleteIds: () => Promise.reject(new Error('offline')) };
    await show('guardian-1', { authorizations: failing });

    expect(await screen.findByText('Ana\nMarin')).toBeOnTheScreen();
    expect(screen.queryByRole('text', { name: 'Autorizado' })).toBeNull();
    expect(screen.queryByRole('text', { name: 'Autorización pendiente' })).toBeNull();
  });

  it('opens the athlete profile id when "Historial" is pressed', async () => {
    const onOpen = jest.fn();
    await show('guardian-1', { onOpen });

    await fireEvent.press(await screen.findByRole('button', { name: 'Historial' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('a1');
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

    expect(await screen.findByText('Ana\nMarin')).toBeOnTheScreen();
  });

  it('still shows the cards when the school name lookup fails', async () => {
    await show('guardian-1', { schoolNames: { listByIds: () => Promise.reject(new Error('offline')) } });

    expect(await screen.findByText('Ana\nMarin')).toBeOnTheScreen();
    expect(await screen.findByText('Grupo A')).toBeOnTheScreen();
  });
});
