import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import { createInMemoryAthleteRegistrationRepository } from '../../athletes';
import { createInMemoryAuthorizationRepository, type AuthorizationText } from '../data/authorizations';
import { createInMemoryManagedAthleteRepository, type ManagedAthleteRow } from '../data/managedAthletes';
import { ClaimAthleteContainer, type ClaimAthleteContainerProps } from '../screens/ClaimAthleteContainer';

// The athletes module reaches the Supabase client, which the sync layer provides; it is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ supabase: {}, db: {}, writeRecord: jest.fn() }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic texts and people only.
const text = (purpose: AuthorizationText['purpose'], version = 1): AuthorizationText => ({ id: `text-${purpose}-${version}`, purpose, version, body: `Texto sintético de ${purpose}.` });
const joinTexts = [text('record_times'), text('import_official_results'), text('share_results_with_school')];
const now = () => new Date('2026-11-22T12:00:00.000Z');

// The school registers the swimmer first, the way the console does; the family then opens the link.
async function schoolRegistersSwimmer() {
  const registrations = createInMemoryAthleteRegistrationRepository({ now });
  registrations.userId = 'school-admin';
  const link = await registrations.register({ athleteId: 'athlete-ana', schoolId: 'school-a', firstName: 'Ana', lastName: 'Prueba', guardianAuthorizationCollected: true });
  registrations.userId = 'family';
  return { registrations, link };
}

const open = async (extra: Partial<ClaimAthleteContainerProps> & { token: string }) => {
  const registrations = extra.repository ?? createInMemoryAthleteRegistrationRepository({ now });
  const props: ClaimAthleteContainerProps = {
    repository: registrations,
    authorizations: createInMemoryAuthorizationRepository(joinTexts),
    newId: (() => {
      let n = 0;
      return () => `authorization-${++n}`;
    })(),
    now,
    onDone: jest.fn(),
    onCancel: jest.fn(),
    ...extra,
  };
  await render(
    <ThemeProvider>
      <ClaimAthleteContainer {...props} />
    </ThemeProvider>,
  );
  return props;
};

const accept = async () => fireEvent.press(await screen.findByRole('button', { name: 'Aceptar y administrar' }));

describe('ClaimAthleteContainer', () => {
  it('shows the three texts of joining a school and nothing is sent until the family accepts', async () => {
    const { registrations, link } = await schoolRegistersSwimmer();
    await open({ token: link.token, repository: registrations });

    expect(await screen.findByText('Texto sintético de record_times.')).toBeOnTheScreen();
    expect(screen.getByText('Texto sintético de import_official_results.')).toBeOnTheScreen();
    expect(screen.getByText('Texto sintético de share_results_with_school.')).toBeOnTheScreen();
    expect(registrations.claimed).toEqual([]);
  });

  it('the family accepts the link and sees the swimmer in their list (Mis deportistas)', async () => {
    const { registrations, link } = await schoolRegistersSwimmer();
    // Stands in for the sync: once the server made the family manager, the swimmer reaches the phone.
    const managed: ManagedAthleteRow[] = [];
    const claim = registrations.claim;
    registrations.claim = async (input) => {
      const athleteId = await claim(input);
      managed.push({ userId: 'family', athleteId, relation: input.relation });
      return athleteId;
    };
    const props = await open({ token: link.token, repository: registrations });

    await accept();

    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith('athlete-ana'));
    expect(await createInMemoryManagedAthleteRepository(managed).listManagedAthleteIds('family')).toEqual(['athlete-ana']);
  });

  it('sends the three authorizations of joining with the text shown, an id each and the time of the acceptance, as a guardian by default', async () => {
    const { registrations, link } = await schoolRegistersSwimmer();
    await open({ token: link.token, repository: registrations });

    await accept();

    await waitFor(() => expect(registrations.claimed).toHaveLength(1));
    expect(registrations.claimed[0]).toEqual({
      token: link.token,
      relation: 'guardian',
      acceptedAt: '2026-11-22T12:00:00.000Z',
      authorizations: [
        { id: 'authorization-1', purpose: 'record_times', textId: 'text-record_times-1' },
        { id: 'authorization-2', purpose: 'import_official_results', textId: 'text-import_official_results-1' },
        { id: 'authorization-3', purpose: 'share_results_with_school', textId: 'text-share_results_with_school-1' },
      ],
    });
  });

  it('claims as the swimmer themself when the adult swimmer says so', async () => {
    const { registrations, link } = await schoolRegistersSwimmer();
    await open({ token: link.token, repository: registrations });

    await fireEvent.press(await screen.findByRole('radio', { name: 'Soy el nadador (adulto)' }));
    await accept();

    await waitFor(() => expect(registrations.claimed[0]?.relation).toBe('self'));
  });

  it('sends a single claim when the button is pressed twice', async () => {
    const { link } = await schoolRegistersSwimmer();
    let finish: (id: string) => void = () => {};
    const claim = jest.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    await open({ token: link.token, repository: { claim } });

    const button = await screen.findByRole('button', { name: 'Aceptar y administrar' });
    await fireEvent.press(button);
    await fireEvent.press(button);

    expect(claim).toHaveBeenCalledTimes(1);
    await act(async () => finish('athlete-ana'));
  });

  it.each([
    ['link_not_found', /Este enlace ya no sirve/],
    ['not_allowed', /personal de la escuela/],
    ['invalid', /No pudimos aceptar las autorizaciones/],
    ['network down', /Si ya aceptaste, revisa Mis deportistas/],
  ])('says what the refusal %p means and stays on the screen', async (code, message) => {
    const { registrations, link } = await schoolRegistersSwimmer();
    registrations.rejectWith = code;
    const props = await open({ token: link.token, repository: registrations });

    await accept();

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(props.onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Aceptar y administrar' })).toBeOnTheScreen();
  });

  it('does not offer to accept while the texts have not reached the phone, and offers to read them again', async () => {
    const { registrations, link } = await schoolRegistersSwimmer();
    await open({ token: link.token, repository: registrations, authorizations: createInMemoryAuthorizationRepository([text('record_times')]) });

    expect(await screen.findByText(/Todavía no llegaron los textos/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Aceptar y administrar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeOnTheScreen();
    expect(registrations.claimed).toEqual([]);
  });

  it('leaves without claiming when the family says Ahora no', async () => {
    const { registrations, link } = await schoolRegistersSwimmer();
    const props = await open({ token: link.token, repository: registrations });

    await fireEvent.press(await screen.findByRole('button', { name: 'Ahora no' }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(registrations.claimed).toEqual([]);
  });
});
