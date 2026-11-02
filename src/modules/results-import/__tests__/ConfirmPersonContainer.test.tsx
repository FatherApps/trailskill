import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryIdentityDocumentRepository } from '../../accounts';
import {
  createInMemoryOfficialSearchRepository,
  type ImportSource,
  type ImportSourcesRepository,
  type SearchCandidate,
} from '../data/officialSearch';
import { ConfirmPersonContainer, formatRetryTime } from '../screens/ConfirmPersonContainer';

// The accounts index reaches the PowerSync repositories; the sync layer is ESM-only for Jest.
jest.mock('../../../core/sync', () => ({ db: {}, writeBatch: jest.fn(), supabase: {} }));
jest.mock('../../../core/sync/db', () => ({ db: {} }));

// Synthetic people, source and numbers only.
const athlete = { id: 'athlete-1', firstName: 'Ana', lastName: 'Example' };
const source: ImportSource = { organizationId: 'org-1', name: 'Federación Sintética' };
const candidate: SearchCandidate = {
  id: 'candidate-1',
  name: 'Ana Example',
  affiliations: [{ club: 'Club Sintético', league: 'Liga Sintética', years: [2024, 2025] }],
  resultCount: 12,
};
const NUMBER = '0000-synthetic.99';

function setup(
  options: {
    authorized?: boolean;
    online?: boolean;
    sources?: ImportSource[] | Error;
    hint?: { present: boolean; lastThree: string | null };
    search?: Parameters<typeof createInMemoryOfficialSearchRepository>[0];
  } = {},
) {
  const sources: ImportSourcesRepository = {
    list: async () => {
      if (options.sources instanceof Error) throw options.sources;
      return options.sources ?? [source];
    },
  };
  const search = createInMemoryOfficialSearchRepository(options.search ?? { candidates: [candidate] });
  const identityDocuments = createInMemoryIdentityDocumentRepository();
  if (options.hint) identityDocuments.hints[athlete.id] = options.hint;
  const props = { onGoToAuthorizations: jest.fn(), onDone: jest.fn(), onBack: jest.fn() };
  const mount = () =>
    render(
      <ConfirmPersonContainer
        athlete={athlete}
        authorized={options.authorized ?? true}
        online={options.online ?? true}
        sources={sources}
        search={search}
        identityDocuments={identityDocuments}
        {...props}
      />,
    );
  return { mount, search, identityDocuments, ...props };
}

const press = async (label: string) => fireEvent.press(await screen.findByRole('button', { name: label }));

describe('ConfirmPersonContainer', () => {
  it('does not go on without import_official_results in force: it leads to Autorizaciones and asks nothing', async () => {
    const s = setup({ authorized: false });
    await s.mount();
    expect(await screen.findByText('Falta la autorización')).toBeOnTheScreen();
    await press('Ir a Autorizaciones');
    expect(s.onGoToAuthorizations).toHaveBeenCalledTimes(1);
    expect(s.search.searches).toEqual([]);
    expect(screen.queryByText('Seguir por nombre')).toBeNull();
  });

  it('says it needs a connection and does not search', async () => {
    const s = setup({ online: false });
    await s.mount();
    expect(await screen.findByText('Sin conexión')).toBeOnTheScreen();
    expect(s.search.searches).toEqual([]);
  });

  it('offers to type the number or to go on by name when none is saved', async () => {
    await setup().mount();
    expect(await screen.findByText('Buscar el historial oficial')).toBeOnTheScreen();
    expect(screen.getByText(/Buscaremos a Ana en Federación Sintética/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Número de identificación (opcional)')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seguir por nombre' })).toBeOnTheScreen();
  });

  it('searches one athlete by name, then asks "¿Es esta persona?" with what was found', async () => {
    const s = setup();
    await s.mount();
    await press('Seguir por nombre');
    expect(await screen.findByText('¿Es esta persona?')).toBeOnTheScreen();
    expect(s.search.searches).toEqual([{ athleteId: 'athlete-1', organizationId: 'org-1', firstName: 'Ana', lastName: 'Example' }]);
    expect(screen.getByText('Ana Example')).toBeOnTheScreen();
    expect(screen.getByText('Club Sintético · Liga Sintética')).toBeOnTheScreen();
    expect(screen.getByText('Años: 2024, 2025')).toBeOnTheScreen();
    expect(screen.getByText('12 resultados')).toBeOnTheScreen();
    expect(screen.getByText(/puede ser una anterior/)).toBeOnTheScreen();
  });

  it('shows the history even when the affiliation is an earlier one, and says so when there is none', async () => {
    const s = setup({ search: { candidates: [{ ...candidate, affiliations: [], resultCount: 1 }] } });
    await s.mount();
    await press('Seguir por nombre');
    expect(await screen.findByText('Sin afiliación registrada')).toBeOnTheScreen();
    expect(screen.getByText('1 resultado')).toBeOnTheScreen();
  });

  it('never shows a document or a birth date, even if the source repository hands them over', async () => {
    const rogue = { ...candidate, idNumber: '1234567890', birthDate: '2012-03-04', document: 'CC 123' } as SearchCandidate;
    await setup({ search: { candidates: [rogue] } }).mount();
    await press('Seguir por nombre');
    await screen.findByText('Ana Example');
    expect(screen.queryByText(/1234567890|2012|CC 123/)).toBeNull();
  });

  it('confirms the candidate by its id and then lets the person go on', async () => {
    const s = setup();
    await s.mount();
    await press('Seguir por nombre');
    await press('Sí, es esta persona');
    expect(await screen.findByText('Confirmado')).toBeOnTheScreen();
    expect(s.search.confirmed).toEqual([{ athleteId: 'athlete-1', organizationId: 'org-1', candidateId: 'candidate-1' }]);
    await press('Listo');
    expect(s.onDone).toHaveBeenCalledTimes(1);
  });

  it('lets the person go back to search again when none of the candidates is the person', async () => {
    const s = setup();
    await s.mount();
    await press('Seguir por nombre');
    await press('No es ninguna de estas');
    expect(await screen.findByText('Buscar el historial oficial')).toBeOnTheScreen();
    expect(s.search.confirmed).toEqual([]);
  });

  it('says so when the source has nobody with that name', async () => {
    await setup({ search: { candidates: [] } }).mount();
    await press('Seguir por nombre');
    expect(await screen.findByText('No encontramos a nadie')).toBeOnTheScreen();
    await press('Volver a buscar');
    expect(await screen.findByText('Buscar el historial oficial')).toBeOnTheScreen();
  });

  describe('the identity number', () => {
    it('saves a typed number with the accounts write and searches, with the number never on screen in the clear', async () => {
      const s = setup();
      await s.mount();
      const field = await screen.findByLabelText('Número de identificación (opcional)');
      expect(field.props.secureTextEntry).toBe(true);
      fireEvent.changeText(field, NUMBER);
      await press('Guardar número y buscar');
      await screen.findByText('¿Es esta persona?');
      expect(s.identityDocuments.saved).toEqual([{ athleteId: 'athlete-1', identityNumber: '0000synthetic99' }]);
      expect(s.search.searches).toHaveLength(1);
      expect(screen.queryByText(new RegExp(NUMBER))).toBeNull();
      expect(JSON.stringify(screen.toJSON())).not.toContain('0000synthetic99');
    });

    it('does not save or search a number that is not valid, and says why', async () => {
      const s = setup();
      await s.mount();
      fireEvent.changeText(await screen.findByLabelText('Número de identificación (opcional)'), 'bad#number');
      await press('Guardar número y buscar');
      expect(await screen.findByText('Usa solo letras y números, hasta 20.')).toBeOnTheScreen();
      expect(s.identityDocuments.saved).toEqual([]);
      expect(s.search.searches).toEqual([]);
    });

    it('searches by name when the field is empty, without saving anything', async () => {
      const s = setup();
      await s.mount();
      fireEvent.changeText(await screen.findByLabelText('Número de identificación (opcional)'), '  ');
      await press('Seguir por nombre');
      await screen.findByText('¿Es esta persona?');
      expect(s.identityDocuments.saved).toEqual([]);
    });

    it('does not search when saving the number fails, and says so', async () => {
      const s = setup();
      await s.mount();
      s.identityDocuments.failing = false;
      const failingSave = jest.spyOn(s.identityDocuments, 'save').mockRejectedValue(new Error('Saving the identity number failed'));
      fireEvent.changeText(await screen.findByLabelText('Número de identificación (opcional)'), NUMBER);
      await press('Guardar número y buscar');
      expect(await screen.findByText('No pudimos guardar el número. Intenta de nuevo.')).toBeOnTheScreen();
      expect(failingSave).toHaveBeenCalledTimes(1);
      expect(s.search.searches).toEqual([]);
    });

    it('with a saved number it asks nothing to type, shows only how it ends, and searches with it', async () => {
      const s = setup({ hint: { present: true, lastThree: '456' } });
      await s.mount();
      expect(await screen.findByText('Ya hay un número de identificación guardado, termina en 456.')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Número de identificación (opcional)')).toBeNull();
      await press('Buscar con el número guardado');
      await screen.findByText('¿Es esta persona?');
      expect(s.identityDocuments.saved).toEqual([]);
    });

    it('does not show any ending when the saved number is too short to hide', async () => {
      await setup({ hint: { present: true, lastThree: null } }).mount();
      expect(await screen.findByText('Ya hay un número de identificación guardado.')).toBeOnTheScreen();
    });
  });

  describe('when the server refuses or the source fails', () => {
    it('shows when the person can try again after the rate limit', async () => {
      const retryAt = '2026-10-29T15:40:00.000Z';
      await setup({ search: { searchFailure: { code: 'rate_limited', retryAt } } }).mount();
      await press('Seguir por nombre');
      expect(await screen.findByText('Espera un momento')).toBeOnTheScreen();
      expect(screen.getByText(`Ya consultamos el origen hace poco. Podrás volver a intentar a las ${formatRetryTime(retryAt)}.`)).toBeOnTheScreen();
    });

    it.each([['unavailable'], ['no_provider']] as const)('tells the source is not available for %s, and the person can leave', async (code) => {
      const s = setup({ search: { searchFailure: { code } } });
      await s.mount();
      await press('Seguir por nombre');
      expect(await screen.findByText('El origen no está disponible')).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      expect(s.onBack).toHaveBeenCalled();
    });

    it('tells the source is not available when no federation has a source, and asks nothing', async () => {
      const s = setup({ sources: [] });
      await s.mount();
      expect(await screen.findByText('El origen no está disponible')).toBeOnTheScreen();
      expect(s.search.searches).toEqual([]);
    });

    it('lets the person retry when the sources cannot be read', async () => {
      const s = setup({ sources: new Error('boom') });
      await s.mount();
      expect(await screen.findByText('No pudimos cargar')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeOnTheScreen();
    });

    it('leads to Autorizaciones when the server says the authorization is not in force', async () => {
      const s = setup({ search: { searchFailure: { code: 'not_authorized' } } });
      await s.mount();
      await press('Seguir por nombre');
      await press('Ir a Autorizaciones');
      expect(s.onGoToAuthorizations).toHaveBeenCalledTimes(1);
    });

    it('tells there is no connection when the search cannot reach the server', async () => {
      await setup({ search: { searchFailure: { code: 'offline' } } }).mount();
      await press('Seguir por nombre');
      expect(await screen.findByText('Sin conexión')).toBeOnTheScreen();
    });

    it('keeps the search form with a message for an unexpected failure', async () => {
      await setup({ search: { searchFailure: { code: 'unexpected' } } }).mount();
      await press('Seguir por nombre');
      expect(await screen.findByText('Algo salió mal. Intenta de nuevo.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Seguir por nombre' })).toBeOnTheScreen();
    });

    it('asks to search again when the candidate expired', async () => {
      await setup({ search: { candidates: [candidate], confirmFailure: { code: 'unknown_id' } } }).mount();
      await press('Seguir por nombre');
      await press('Sí, es esta persona');
      expect(await screen.findByText('La búsqueda venció. Vuelve a buscar.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Seguir por nombre' })).toBeOnTheScreen();
    });

    it('does not confirm a history that does not match the saved number, and says so', async () => {
      await setup({ search: { candidates: [candidate], confirmFailure: { code: 'identity_number_conflict' } } }).mount();
      await press('Seguir por nombre');
      await press('Sí, es esta persona');
      expect(await screen.findByText('Este historial no coincide con el número que ya está guardado, así que no lo confirmamos.')).toBeOnTheScreen();
      expect(screen.queryByText('Confirmado')).toBeNull();
    });
  });

  it('does not offer to type a number when it cannot tell whether one is saved, and lets the person retry', async () => {
    const s = setup();
    s.identityDocuments.failing = true;
    await s.mount();
    expect(await screen.findByText('No pudimos cargar')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Número de identificación (opcional)')).toBeNull();
    s.identityDocuments.failing = false;
    await press('Reintentar');
    await waitFor(() => expect(screen.getByLabelText('Número de identificación (opcional)')).toBeOnTheScreen());
  });
});
