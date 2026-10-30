import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { createInMemoryAuthorizationStatusRepository } from '../../accounts';
import {
  createInMemoryImportedResultsRepository,
  createOfficialUpdate,
  OfficialUpdateContainer,
  type FoundResult,
  type ImportedResult,
  type OfficialResultsService,
  type PendingChangeResolver,
  type PendingResultChange,
} from '..';

// The public entries also export PowerSync repositories, which load the ESM-only sync stack.
jest.mock('../../../core/sync', () => ({ db: {}, supabase: {}, useQuery: jest.fn(), useRecordSyncStates: jest.fn(() => new Map()) }));

const values = { stroke: 'FR', distance: '50m', pool: 'LCM', hundredths: 2890, swumOn: '2026-03-14', competition: 'Torneo de prueba' } as const;
const found = (id: string, overrides: Partial<FoundResult> = {}): FoundResult => ({ id, ...values, swumOn: '2026-05-02', ...overrides });
const imported = (overrides: Partial<ImportedResult> = {}): ImportedResult => ({
  id: 'r1', athleteId: 'a1', importId: 'i1', provider: 'zz-test', sourceResultKey: 'k1', revision: 1, supersedesId: null, createdAt: '2026-10-28T10:00:00Z', ...values, ...overrides,
});
const change = (): PendingResultChange & { status: 'pending' } => ({
  id: 'c1', importedResultId: 'r1', athleteId: 'a1', importId: 'i2', createdAt: '2026-10-28T11:00:00Z', status: 'pending', ...values, hundredths: 2850,
});

const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = (error: object) => ({ ok: false as const, error });
const summary = (inserted = 1, changes = 0) => ok({ importId: 'i9', inserted, duplicates: 0, changes });

function setup({
  service: overrides = {},
  results = [imported()],
  changes = [] as ReturnType<typeof change>[],
  confirmed = true,
  granted = ['import_official_results'],
  resolve = jest.fn().mockResolvedValue(true),
}: { service?: Partial<OfficialResultsService>; results?: ImportedResult[]; changes?: ReturnType<typeof change>[]; confirmed?: boolean; granted?: string[]; resolve?: jest.Mock } = {}) {
  const service = {
    status: jest.fn(),
    results: jest.fn().mockResolvedValue(ok([found('f1'), found('f2', { distance: '100m' })])),
    importChosen: jest.fn().mockResolvedValue(summary(2)),
    ...overrides,
  } as jest.Mocked<OfficialResultsService>;
  const repository = createInMemoryImportedResultsRepository(results, changes, [{ athleteId: 'a1', requestedAt: '2026-10-28T10:00:00Z' }]);
  const resolver: PendingChangeResolver = { resolve };
  const authorizations = createInMemoryAuthorizationStatusRepository(
    granted.map((purpose) => ({ athleteId: 'a1', purpose, isGranted: true })) as never,
  );
  const view = (
    <OfficialUpdateContainer
      athleteId="a1"
      update={createOfficialUpdate({ service, repository })}
      repository={repository}
      identity={{ isConfirmed: async () => confirmed }}
      authorizations={authorizations}
      resolver={resolver}
    />
  );
  return { service, resolve, view };
}

const button = () => screen.queryByText('Actualizar resultados oficiales');

describe('OfficialUpdateContainer', () => {
  it.each([
    ['the identity is not confirmed', { confirmed: false }],
    ['the authorization is not in force', { granted: [] as string[] }],
  ])('shows no button when %s', async (_name, options) => {
    await render(setup(options).view);
    await waitFor(() => expect(screen.queryByText('Actualizar resultados oficiales')).toBeNull());
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the button and the date of the last update when confirmed and authorized', async () => {
    await render(setup().view);
    expect(await screen.findByText('Actualizar resultados oficiales')).toBeOnTheScreen();
    expect(screen.getByText(/Última actualización: /)).toBeOnTheScreen();
  });

  it('lists the new results preselected and imports only the ones left chosen', async () => {
    const { view, service } = setup();
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    expect(await screen.findByText('Importar 2 resultados')).toBeOnTheScreen();

    fireEvent.press(screen.getAllByRole('checkbox')[1]!);
    fireEvent.press(await screen.findByText('Importar 1 resultado'));

    await waitFor(() => expect(service.importChosen).toHaveBeenCalledWith('a1', ['f1']));
    expect(await screen.findByText(/Importamos 2 resultados\./)).toBeOnTheScreen();
  });

  it('imports nothing until the guardian confirms', async () => {
    const { view, service } = setup();
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    await screen.findByText('Importar 2 resultados');
    expect(service.importChosen).not.toHaveBeenCalled();
  });

  it('does not ask the source again on a second press while it checks', async () => {
    let finish!: (value: unknown) => void;
    const { view, service } = setup({ service: { results: jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))) } });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    // While it checks the button shows its loading label and a press does nothing.
    fireEvent.press(await screen.findByText('Consultando…'));
    finish(ok([]));
    await screen.findByText('No hay resultados nuevos');

    expect(service.results).toHaveBeenCalledTimes(1);
  });

  it('says there is nothing new and changes nothing', async () => {
    const { view, service } = setup({ service: { results: jest.fn().mockResolvedValue(ok([found('f1', { swumOn: '2026-03-14' })])) } });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    expect(await screen.findByText('No hay resultados nuevos')).toBeOnTheScreen();
    expect(service.importChosen).not.toHaveBeenCalled();
  });

  it('shows when the next try is allowed after a rate limit', async () => {
    const retryAt = new Date(2026, 9, 29, 12, 10).toISOString();
    const { view } = setup({ service: { results: jest.fn().mockResolvedValue(fail({ code: 'rate_limited', retryAt })) } });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    expect(await screen.findByText('Podrás volver a intentarlo a las 12:10.')).toBeOnTheScreen();
  });

  it('says "No disponible" when the source fails and leaves the changes and the button in place', async () => {
    const { view } = setup({ service: { results: jest.fn().mockResolvedValue(fail({ code: 'unavailable' })) }, changes: [change()] });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    expect(await screen.findByText('No disponible')).toBeOnTheScreen();
    expect(screen.getByText('Cambiaron en el origen')).toBeOnTheScreen();
    expect(button()).toBeOnTheScreen();
  });

  it('asks again and says so when the server forgot the list', async () => {
    const importChosen = jest.fn().mockResolvedValue(fail({ code: 'unknown_id' }));
    const { view, service } = setup({ service: { importChosen } });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    fireEvent.press(await screen.findByText('Importar 2 resultados'));

    expect(await screen.findByText(/La lista venció/)).toBeOnTheScreen();
    expect(service.results).toHaveBeenCalledTimes(2);
  });

  it('keeps the list and says so when the import fails', async () => {
    const { view } = setup({ service: { importChosen: jest.fn().mockResolvedValue(fail({ code: 'unavailable' })) } });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    fireEvent.press(await screen.findByText('Importar 2 resultados'));

    expect(await screen.findByText('No pudimos importar. Lo que ya tenías sigue igual.')).toBeOnTheScreen();
    expect(screen.getByText('Importar 2 resultados')).toBeOnTheScreen();
  });

  it('shows a missing time as a dash, never zero', async () => {
    const { view } = setup({ service: { results: jest.fn().mockResolvedValue(ok([found('f1', { hundredths: null })])) } });
    await render(view);
    fireEvent.press(await screen.findByText('Actualizar resultados oficiales'));
    await screen.findByText('Importar 1 resultado');
    // The row hides its visual children from screen readers because its label already says everything.
    const hidden = { includeHiddenElements: true };
    expect(screen.getAllByText('—', hidden).length).toBeGreaterThan(0);
    expect(screen.queryByText(/0[,.]00/, hidden)).toBeNull();
    expect(screen.getByLabelText(/sin tiempo/)).toBeOnTheScreen();
  });

  describe('a result that changed at the source', () => {
    it('shows the value imported before next to the new one, with both choices', async () => {
      await render(setup({ changes: [change()] }).view);
      expect(await screen.findByText('Cambiaron en el origen')).toBeOnTheScreen();
      expect(screen.getByText('Importado antes')).toBeOnTheScreen();
      expect(screen.getByText('Nuevo en el origen')).toBeOnTheScreen();
      expect(screen.getByText('Usar el valor nuevo')).toBeOnTheScreen();
      expect(screen.getByText('Mantener el actual')).toBeOnTheScreen();
    });

    it.each([
      ['Usar el valor nuevo', 'use_new'],
      ['Mantener el actual', 'keep_current'],
    ])('records %s on the server and clears the card', async (label, choice) => {
      const { view, resolve } = setup({ changes: [change()] });
      await render(view);
      fireEvent.press(await screen.findByText(label));

      await waitFor(() => expect(resolve).toHaveBeenCalledWith('c1', choice));
      await waitFor(() => expect(screen.queryByText('Cambiaron en el origen')).toBeNull());
    });

    it('keeps the card and the value shown before when the choice cannot be saved', async () => {
      const { view } = setup({ changes: [change()], resolve: jest.fn().mockResolvedValue(false) });
      await render(view);
      fireEvent.press(await screen.findByText('Usar el valor nuevo'));

      expect(await screen.findByText('No pudimos guardar tu elección. Intenta de nuevo.')).toBeOnTheScreen();
      expect(screen.getByText('Importado antes')).toBeOnTheScreen();
    });

    it('does not record anything without a choice', async () => {
      const { view, resolve } = setup({ changes: [change()] });
      await render(view);
      await screen.findByText('Cambiaron en el origen');
      expect(resolve).not.toHaveBeenCalled();
    });
  });
});
