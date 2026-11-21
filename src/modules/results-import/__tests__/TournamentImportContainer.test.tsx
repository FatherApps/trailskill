import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryIdentityDocumentRepository } from '../../accounts';
import { createInMemoryOfficialSearchRepository, type ImportSource, type ImportSourcesRepository } from '../data/officialSearch';
import { createInMemoryTournamentCatalogRepository, type TournamentCatalogEntry } from '../data/tournamentCatalog';
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

const tournament = (id: string, dateKey: string, name: string, city: string): TournamentCatalogEntry => ({
  id,
  organizationId: 'org-platform',
  year: Number(dateKey.slice(0, 4)),
  dateKey,
  name,
  city,
  discipline: 'swimming',
  course: null,
  sourceUrl: null,
  refreshedAt: '2026-11-21T00:00:00Z',
});
const catalogEntries = [
  tournament('t1', '20251018', 'Torneo Zeta Abierto', 'Ciudad Zeta'),
  tournament('t2', '20251018', 'Torneo Alfa Nocturno', 'Ciudad Alfa'),
  tournament('t3', '20260510', 'Torneo Beta', 'Ciudad Beta'),
  tournament('t4', '20260510', 'Copa Alfa', 'Ciudad Alfa'),
  tournament('t5', '20260315', 'Torneo Gamma', 'Ciudad Beta'),
];

function setup(
  options: {
    entries?: TournamentCatalogEntry[];
    refresh?: () => Promise<void>;
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
  const catalog = createInMemoryTournamentCatalogRepository(options.entries ?? catalogEntries);
  const refreshCatalog = jest.fn(options.refresh ?? (async () => undefined));
  const props = { onGoToAuthorizations: jest.fn(), onDone: jest.fn(), onBack: jest.fn() };
  const mount = () =>
    render(
      <TournamentImportContainer
        athlete={athlete}
        authorized={options.authorized ?? true}
        online={options.online ?? true}
        sources={sources}
        catalog={catalog}
        refreshCatalog={refreshCatalog}
        search={search}
        results={{ importChosen }}
        identityDocuments={identityDocuments}
        {...props}
      />,
    );
  return { mount, search, importChosen, refreshCatalog, ...props };
}

const press = async (label: string) => fireEvent.press(await screen.findByRole('button', { name: label }));
const chip = async (label: string) => fireEvent.press(await screen.findByRole('radio', { name: label }));
const fill = async (label: string, text: string) => fireEvent.changeText(await screen.findByLabelText(label), text);

const PASTE = '¿No está en la lista? Pegar la dirección';

async function searchWith(s: ReturnType<typeof setup>) {
  await s.mount();
  await press(PASTE);
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

  it('lists the synced tournaments without a connection, and says a search needs one', async () => {
    const s = setup({ online: false });
    await s.mount();
    expect(await screen.findByText('Torneo Beta')).toBeOnTheScreen();
    expect(screen.getByText('Sin conexión. Puedes ver la lista; para buscar en un torneo necesitas conexión.')).toBeOnTheScreen();
    expect(s.refreshCatalog).not.toHaveBeenCalled();

    await press('Torneo Beta, 10 may 2026');
    expect(await screen.findByText('Sin conexión')).toBeOnTheScreen();
    expect(s.search.tournaments).toEqual([]);
  });

  it('asks for the address and the number when none is saved, and for the number only then', async () => {
    const s = setup();
    await s.mount();
    await press(PASTE);
    expect(await screen.findByLabelText('Dirección del torneo')).toBeOnTheScreen();
    expect(screen.getByLabelText('Número de identificación')).toBeOnTheScreen();
  });

  it('does not ask for a number that is already saved, and sends none', async () => {
    const s = setup({ hint: { present: true, lastThree: '123' } });
    await s.mount();
    await press(PASTE);
    await fill('Dirección del torneo', URL);
    expect(screen.queryByLabelText('Número de identificación')).toBeNull();
    await press('Buscar en el torneo');
    await screen.findByText('¿Es esta persona?');
    expect(s.search.tournaments).toEqual([{ athleteId: 'athlete-1', url: URL }]);
  });

  it('asks nothing when the number is missing and says why', async () => {
    const s = setup();
    await s.mount();
    await press(PASTE);
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

  it('says the confirmation is saved when the import after it fails, and retries only the import', async () => {
    const s = setup({ importFails: true });
    await searchWith(s);
    await press('Sí, es esta persona');

    expect(await screen.findByText('No pudimos importar los resultados')).toBeOnTheScreen();
    expect(screen.getByText('Tu confirmación ya quedó guardada. Intenta importar de nuevo; no hace falta confirmar otra vez.')).toBeOnTheScreen();
    expect(screen.queryByText('El origen no está disponible')).toBeNull();

    s.importChosen.mockResolvedValueOnce({ ok: true, value: { importId: 'i1', inserted: 2, duplicates: 0, changes: 0 } });
    await press('Reintentar importación');

    expect(await screen.findByText('Importamos 2 resultados de Ana. Ya aparecen en su historial.')).toBeOnTheScreen();
    expect(s.importChosen).toHaveBeenCalledTimes(2);
    expect(s.importChosen).toHaveBeenLastCalledWith('athlete-1', ['r1', 'r2']);
    // The confirmation is not asked again.
    expect(s.search.tournamentConfirmed).toHaveLength(1);
  });

  it('stays on the retry when the second import fails too', async () => {
    const s = setup({ importFails: true });
    await searchWith(s);
    await press('Sí, es esta persona');
    await press('Reintentar importación');

    await waitFor(() => expect(s.importChosen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No pudimos importar los resultados')).toBeOnTheScreen();
    expect(s.search.tournamentConfirmed).toHaveLength(1);
  });

  it('says the tournament offered no results, not that there were no new ones', async () => {
    const s = setup({ search: { tournamentResults: [] } });
    await searchWith(s);
    await press('Sí, es esta persona');

    expect(await screen.findByText('El torneo no ofreció resultados de Ana para importar.')).toBeOnTheScreen();
    expect(s.importChosen).not.toHaveBeenCalled();
  });

  it('says the person is not in the tournament, without confirming or importing', async () => {
    const s = setup({ search: { tournament: { organizationId: 'org-platform', candidate: null } } });
    await searchWith(s);

    expect(await screen.findByText('No encontramos a nadie')).toBeOnTheScreen();
    expect(screen.getByText('No hay un historial de Ana en el torneo. Revisa que la dirección sea la del torneo donde compitió.')).toBeOnTheScreen();
    expect(screen.queryByText(/prueba con el número/)).toBeNull();
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

describe('TournamentImportContainer: the list', () => {
  const texts = (pattern: RegExp) => screen.getAllByText(pattern).map((node) => node.props.children);

  it('asks the server to refresh the catalog once and does not wait for the answer', async () => {
    const s = setup({ refresh: () => new Promise<void>(() => {}) });
    await s.mount();
    expect(await screen.findByText('Torneo Beta')).toBeOnTheScreen();
    expect(s.refreshCatalog).toHaveBeenCalledTimes(1);
  });

  it('shows a chip for each year of the catalog, newest first, and Todos chosen', async () => {
    const s = setup();
    await s.mount();
    await screen.findByText('Torneo Beta');
    expect(screen.getAllByRole('radio').map((chip) => chip.props.accessibilityLabel)).toEqual(['2026', '2025', 'Todos']);
    expect(screen.getByRole('radio', { name: 'Todos', checked: true })).toBeOnTheScreen();
  });

  it('gets a new year chip when its rows are in the catalog', async () => {
    const s = setup({ entries: [...catalogEntries, tournament('t6', '20270110', 'Torneo Delta', 'Ciudad Delta')] });
    await s.mount();
    await screen.findByText('Torneo Beta');
    expect(screen.getAllByRole('radio').map((chip) => chip.props.accessibilityLabel)).toEqual(['2027', '2026', '2025', 'Todos']);
  });

  it('shows only Todos, the empty state and the link to paste the address when the catalog is empty', async () => {
    const s = setup({ entries: [] });
    await s.mount();
    expect(await screen.findByText('No encontramos torneos con ese filtro')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio').map((chip) => chip.props.accessibilityLabel)).toEqual(['Todos']);
    await press(PASTE);
    expect(await screen.findByLabelText('Dirección del torneo')).toBeOnTheScreen();
  });

  it('groups by city from A to Z with the name and the date of each tournament', async () => {
    const s = setup();
    await s.mount();
    await screen.findByText('Torneo Beta');
    expect(texts(/^Ciudad /)).toEqual(['Ciudad Alfa', 'Ciudad Beta', 'Ciudad Zeta']);
    expect(screen.getByRole('button', { name: 'Torneo Alfa Nocturno, 18 oct 2025' })).toBeOnTheScreen();
    expect(screen.getAllByText('18 oct 2025')).toHaveLength(2);
  });

  it('filters by part of the name or of the city', async () => {
    const s = setup();
    await s.mount();
    await fill('Buscar', 'noctur');
    expect(await screen.findByText('Torneo Alfa Nocturno')).toBeOnTheScreen();
    expect(screen.queryByText('Torneo Beta')).toBeNull();

    await fill('Buscar', 'ciudad zeta');
    expect(await screen.findByText('Torneo Zeta Abierto')).toBeOnTheScreen();
    expect(screen.queryByText('Torneo Alfa Nocturno')).toBeNull();
  });

  it('filters by year', async () => {
    const s = setup();
    await s.mount();
    await chip('2025');
    expect(await screen.findByText('Torneo Zeta Abierto')).toBeOnTheScreen();
    expect(screen.queryByText('Torneo Beta')).toBeNull();
  });

  it('says nothing matched and opens the address field from the link', async () => {
    const s = setup();
    await s.mount();
    await fill('Buscar', 'nada coincide');
    expect(await screen.findByText('No encontramos torneos con ese filtro')).toBeOnTheScreen();

    await press(PASTE);
    expect(await screen.findByLabelText('Dirección del torneo')).toBeOnTheScreen();
  });

  it('sends the tournamentKey and not a url when the tournament comes from the list', async () => {
    const s = setup();
    await s.mount();
    await press('Torneo Beta, 10 may 2026');
    await fill('Número de identificación', NUMBER);
    expect(screen.queryByLabelText('Dirección del torneo')).toBeNull();
    await press('Buscar en el torneo');

    expect(await screen.findByText('¿Es esta persona?')).toBeOnTheScreen();
    expect(s.search.tournaments).toEqual([{ athleteId: 'athlete-1', tournamentKey: '20260510', identityNumber: '0000synthetic99' }]);
  });

  it('can go back to the list from the chosen tournament', async () => {
    const s = setup();
    await s.mount();
    await press('Torneo Beta, 10 may 2026');
    await press('Elegir otro torneo');
    expect(await screen.findByText('Torneo Alfa Nocturno')).toBeOnTheScreen();
  });

  it('says «Aún sin resultados» when the tournament picked from the list has no file', async () => {
    const s = setup({ hint: { present: true, lastThree: '123' }, search: { tournamentFailure: { code: 'no_file' } } });
    await s.mount();
    await press('Torneo Beta, 10 may 2026');
    await press('Buscar en el torneo');

    expect(await screen.findByText('Aún sin resultados')).toBeOnTheScreen();
    expect(screen.queryByText('El origen no está disponible')).toBeNull();
  });

  it('keeps the generic message for a pasted address without a file', async () => {
    const s = setup({ search: { tournamentFailure: { code: 'no_file' } } });
    await searchWith(s);

    expect(await screen.findByText('El origen no está disponible')).toBeOnTheScreen();
    expect(screen.queryByText('Aún sin resultados')).toBeNull();
  });
});

describe('TournamentImportContainer: the calendar', () => {
  const openCalendar = async (s: ReturnType<typeof setup>) => {
    await s.mount();
    await press('Filtrar por fecha');
  };
  const MAY_10 = '10 de mayo, 2 torneos';

  it('opens on the month of the newest tournament and moves between months', async () => {
    const s = setup();
    await openCalendar(s);
    expect(await screen.findByText('Mayo 2026')).toBeOnTheScreen();
    await press('Mes anterior');
    expect(await screen.findByText('Abril 2026')).toBeOnTheScreen();
    await press('Mes siguiente');
    await press('Mes siguiente');
    expect(await screen.findByText('Junio 2026')).toBeOnTheScreen();
  });

  it('marks with a dot only the days that have tournaments', async () => {
    const s = setup();
    await openCalendar(s);
    await screen.findByText('Mayo 2026');
    expect(screen.getByTestId('day-dot-20260510')).toBeOnTheScreen();
    expect(screen.queryByTestId('day-dot-20260511')).toBeNull();
  });

  it('names each day with its number of tournaments for a screen reader', async () => {
    const s = setup();
    await openCalendar(s);
    expect(await screen.findByRole('button', { name: MAY_10 })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '11 de mayo, sin torneos' })).toBeOnTheScreen();
    await press('Mes anterior');
    await press('Mes anterior');
    await press('Mes anterior');
    await press('Mes anterior');
    await press('Mes anterior');
    await press('Mes anterior');
    await press('Mes anterior');
    expect(await screen.findByRole('button', { name: '18 de octubre, 2 torneos' })).toBeOnTheScreen();
  });

  it('shows only the tournaments of the chosen day', async () => {
    const s = setup();
    await openCalendar(s);
    await press(MAY_10);

    expect(await screen.findByText('Fecha: 10 may 2026')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: MAY_10, selected: true })).toBeOnTheScreen();
    expect(screen.getByText('Torneo Beta')).toBeOnTheScreen();
    expect(screen.getByText('Copa Alfa')).toBeOnTheScreen();
    expect(screen.queryByText('Torneo Zeta Abierto')).toBeNull();
  });

  it('clears the day by tapping it again', async () => {
    const s = setup();
    await openCalendar(s);
    await press(MAY_10);
    await press(MAY_10);

    // The day is gone; the year chip it moved stays until the person chooses another.
    expect(await screen.findByText('Torneo Gamma')).toBeOnTheScreen();
    expect(screen.queryByText(/^Fecha:/)).toBeNull();
  });

  it('clears the day with «Quitar fecha»', async () => {
    const s = setup();
    await openCalendar(s);
    await press(MAY_10);
    await press('Quitar fecha');

    expect(await screen.findByText('Torneo Gamma')).toBeOnTheScreen();
    expect(screen.queryByText(/^Fecha:/)).toBeNull();
  });

  it('moves the year chip to the year of the chosen day', async () => {
    const s = setup();
    await openCalendar(s);
    await chip('2025');
    expect(screen.getByRole('radio', { name: '2025', checked: true })).toBeOnTheScreen();
    await chip('Todos');
    await press(MAY_10);

    expect(await screen.findByRole('radio', { name: '2026', checked: true })).toBeOnTheScreen();
  });

  it('adds to the search box', async () => {
    const s = setup();
    await openCalendar(s);
    await press(MAY_10);
    await fill('Buscar', 'beta');

    expect(await screen.findByText('Torneo Beta')).toBeOnTheScreen();
    expect(screen.queryByText('Copa Alfa')).toBeNull();
  });

  it('drops the day when another year chip is chosen', async () => {
    const s = setup();
    await openCalendar(s);
    await press(MAY_10);
    await chip('2025');

    expect(await screen.findByText('Torneo Zeta Abierto')).toBeOnTheScreen();
    expect(screen.queryByText(/^Fecha:/)).toBeNull();
  });

  it('says a day without tournaments matched nothing and keeps the link to paste the address', async () => {
    const s = setup();
    await openCalendar(s);
    await press('11 de mayo, sin torneos');

    expect(await screen.findByText('No encontramos torneos con ese filtro')).toBeOnTheScreen();
    await press(PASTE);
    expect(await screen.findByLabelText('Dirección del torneo')).toBeOnTheScreen();
  });
});
