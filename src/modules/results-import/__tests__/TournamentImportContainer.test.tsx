import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryIdentityDocumentRepository } from '../../accounts';
import { createInMemoryOfficialSearchRepository, type ImportSource, type ImportSourcesRepository } from '../data/officialSearch';
import { TournamentImportContainer } from '../screens/TournamentImportContainer';

// The accounts index reaches the PowerSync repositories; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, writeBatch: jest.fn(), supabase: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic people, platform, address and numbers only.
const athlete = { id: 'athlete-1', firstName: 'Ana' };
const platform: ImportSource = { organizationId: 'org-platform', name: 'Plataforma Sintética', kind: 'platform', provider: 'xx-torneo' };
const URL = 'https://example.test/torneos/2026/20260510/';
const NUMBER = '0000-synthetic.99';
const found = { organizationId: 'org-platform', candidate: { id: 'c1', name: 'Ana Example', club: 'Club Sintético', resultCount: 3 } };
const offered = [
  { id: 'r1', stroke: 'FR' as const, distance: '50m' as const, pool: 'SCM' as const, hundredths: 3012 as never, swumOn: '2026-05-10', competition: 'Torneo Sintético' },
  { id: 'r2', stroke: 'BK' as const, distance: '50m' as const, pool: 'SCM' as const, hundredths: null, swumOn: '2026-05-10', competition: 'Torneo Sintético' },
];

function setup(
  options: {
    authorized?: boolean;
    online?: boolean;
    hint?: { present: boolean; lastThree: string | null };
    search?: Parameters<typeof createInMemoryOfficialSearchRepository>[0];
    importFails?: boolean;
  } = {},
) {
  const sources: ImportSourcesRepository = { list: async () => [platform] };
  const search = createInMemoryOfficialSearchRepository({ tournament: found, tournamentResults: offered, ...options.search });
  const importChosen = jest.fn(async (_athleteId: string, ids: string[]) =>
    options.importFails
      ? ({ ok: false, error: { code: 'unavailable' } } as const)
      : ({ ok: true, value: { importId: 'i1', inserted: ids.length, duplicates: 0, changes: 0 } } as const),
  );
  const identityDocuments = createInMemoryIdentityDocumentRepository();
  if (options.hint) identityDocuments.hints[athlete.id] = options.hint;
  const props = { onGoToAuthorizations: jest.fn(), onDone: jest.fn(), onBack: jest.fn() };
  const mount = () =>
    render(
      <TournamentImportContainer
        athlete={athlete}
        authorized={options.authorized ?? true}
        online={options.online ?? true}
        sources={sources}
        search={search}
        results={{ importChosen }}
        identityDocuments={identityDocuments}
        {...props}
      />,
    );
  return { mount, search, importChosen, ...props };
}

const press = async (label: string) => fireEvent.press(await screen.findByRole('button', { name: label }));
const fill = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);

async function searchWith(s: ReturnType<typeof setup>) {
  await s.mount();
  await fill('Dirección del torneo', URL);
  await fill('Número de identificación', NUMBER);
  await press('Buscar en el torneo');
}

describe('TournamentImportContainer', () => {
  it('leads to Autorizaciones without the authorization and asks nothing', async () => {
    const s = setup({ authorized: false });
    await s.mount();
    await press('Ir a Autorizaciones');
    expect(s.onGoToAuthorizations).toHaveBeenCalledTimes(1);
    expect(s.search.tournaments).toEqual([]);
  });

  it('says it needs a connection and asks nothing', async () => {
    const s = setup({ online: false });
    await s.mount();
    expect(await screen.findByText('Sin conexión')).toBeOnTheScreen();
    expect(s.search.tournaments).toEqual([]);
  });

  it('asks for the address and the number when none is saved, and for the number only then', async () => {
    const s = setup();
    await s.mount();
    expect(await screen.findByLabelText('Dirección del torneo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Número de identificación')).toBeOnTheScreen();
  });

  it('does not ask for a number that is already saved, and sends none', async () => {
    const s = setup({ hint: { present: true, lastThree: '123' } });
    await s.mount();
    await fill('Dirección del torneo', URL);
    expect(screen.queryByLabelText('Número de identificación')).toBeNull();
    await press('Buscar en el torneo');
    await screen.findByText('¿Es esta persona?');
    expect(s.search.tournaments).toEqual([{ athleteId: 'athlete-1', url: URL }]);
  });

  it('asks nothing when the number is missing and says why', async () => {
    const s = setup();
    await s.mount();
    await fill('Dirección del torneo', URL);
    await press('Buscar en el torneo');
    expect(await screen.findByText('Escribe el número de identificación para buscar en el torneo.')).toBeOnTheScreen();
    expect(s.search.tournaments).toEqual([]);
  });

  it('shows only the name and the club of the person found, and saves nothing before the confirmation', async () => {
    const s = setup();
    await searchWith(s);

    expect(await screen.findByText('¿Es esta persona?')).toBeOnTheScreen();
    expect(screen.getByText('Ana Example')).toBeOnTheScreen();
    expect(screen.getByText('Club Sintético')).toBeOnTheScreen();
    expect(s.search.tournaments).toEqual([{ athleteId: 'athlete-1', url: URL, identityNumber: '0000synthetic99' }]);
    // Without the guardian's yes nothing is confirmed and nothing is imported.
    expect(s.search.tournamentConfirmed).toEqual([]);
    expect(s.importChosen).not.toHaveBeenCalled();
    // The number is not left on the screen.
    expect(screen.queryByText(NUMBER)).toBeNull();
  });

  it('saves nothing when the guardian says it is not this person', async () => {
    const s = setup();
    await searchWith(s);
    await press('No es ninguna de estas');

    expect(await screen.findByLabelText('Dirección del torneo')).toBeOnTheScreen();
    expect(s.search.tournamentConfirmed).toEqual([]);
    expect(s.importChosen).not.toHaveBeenCalled();
  });

  it('imports exactly the results the server offered, only after the confirmation', async () => {
    const s = setup();
    await searchWith(s);
    await press('Sí, es esta persona');

    await waitFor(() => expect(s.importChosen).toHaveBeenCalledWith('athlete-1', ['r1', 'r2']));
    expect(s.search.tournamentConfirmed).toEqual([{ athleteId: 'athlete-1', organizationId: 'org-platform', candidateId: 'c1' }]);
    expect(await screen.findByText('Importamos 2 resultados de Ana. Ya aparecen en su historial.')).toBeOnTheScreen();
    await press('Listo');
    expect(s.onDone).toHaveBeenCalledTimes(1);
  });

  it('does not import when the confirmation fails', async () => {
    const s = setup({ search: { confirmTournamentFailure: { code: 'unavailable' } } });
    await searchWith(s);
    await press('Sí, es esta persona');

    expect(await screen.findByText('El origen no está disponible')).toBeOnTheScreen();
    expect(s.importChosen).not.toHaveBeenCalled();
  });

  it('tells when the import after the confirmation fails', async () => {
    const s = setup({ importFails: true });
    await searchWith(s);
    await press('Sí, es esta persona');

    expect(await screen.findByText('El origen no está disponible')).toBeOnTheScreen();
  });

  it('says the person is not in the tournament, without confirming or importing', async () => {
    const s = setup({ search: { tournament: { organizationId: 'org-platform', candidate: null } } });
    await searchWith(s);

    expect(await screen.findByText('No encontramos a nadie')).toBeOnTheScreen();
    expect(s.search.tournamentConfirmed).toEqual([]);
    expect(s.importChosen).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: 'no_provider' } as const, 'No reconocemos esa dirección de torneo. Revisa que esté completa.'],
    [{ code: 'identity_number_required' } as const, 'Escribe el número de identificación para buscar en el torneo.'],
    [{ code: 'identity_number_conflict' } as const, 'Este historial no coincide con el número que ya está guardado, así que no lo confirmamos.'],
  ])('goes back to the address with a message for %p', async (failure, message) => {
    const s = setup({ search: { tournamentFailure: failure } });
    await searchWith(s);

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(s.importChosen).not.toHaveBeenCalled();
  });

  it('tells when to try again after a rate limit', async () => {
    const s = setup({ search: { tournamentFailure: { code: 'rate_limited', retryAt: '2026-05-10T15:30:00Z' } } });
    await searchWith(s);

    expect(await screen.findByText('Espera un momento')).toBeOnTheScreen();
  });
});
