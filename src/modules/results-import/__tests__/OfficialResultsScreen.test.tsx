import { fireEvent, render, screen } from '@testing-library/react-native';

import { createImportFooterStore, ImportFooterSlot } from '../components/ImportFooterSlot';
import { resultItemsFixture } from '../__fixtures__/officialResults';
import { OfficialResultsScreen, type OfficialResultsView } from '../screens/OfficialResultsScreen';

async function setup(selectedIds: string[]) {
  const onImport = jest.fn();
  const view: OfficialResultsView = { kind: 'list', items: resultItemsFixture, selectedIds, importing: false, onToggle: jest.fn(), onImport, onDismiss: jest.fn() };
  await render(<OfficialResultsScreen view={view} changes={[]} onUseNew={jest.fn()} onKeepCurrent={jest.fn()} />);
  return { onImport };
}

describe('OfficialResultsScreen import confirmation', () => {
  it('does not show the sheet when the list loads', async () => {
    await setup(['fx-1', 'fx-2', 'fx-3']);
    expect(screen.queryByText('¿Importar 3 resultados?')).toBeNull();
    expect(screen.getByText('Importar 3 resultados')).toBeOnTheScreen();
  });

  it('asks before importing, with the count in the title', async () => {
    const { onImport } = await setup(['fx-1', 'fx-2', 'fx-3']);
    await fireEvent.press(screen.getByText('Importar 3 resultados'));
    expect(screen.getByText('¿Importar 3 resultados?')).toBeOnTheScreen();
    expect(screen.getByText('Los resultados elegidos se agregan al historial.')).toBeOnTheScreen();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('uses the singular for one chosen result', async () => {
    await setup(['fx-1']);
    await fireEvent.press(screen.getByText('Importar 1 resultado'));
    expect(screen.getByText('¿Importar 1 resultado?')).toBeOnTheScreen();
  });

  it('imports once on Confirmar and closes the sheet', async () => {
    const { onImport } = await setup(['fx-1', 'fx-2']);
    await fireEvent.press(screen.getByText('Importar 2 resultados'));
    await fireEvent.press(screen.getByText('Confirmar'));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('¿Importar 2 resultados?')).toBeNull();
  });

  it('imports nothing on Cancelar', async () => {
    const { onImport } = await setup(['fx-1', 'fx-2']);
    await fireEvent.press(screen.getByText('Importar 2 resultados'));
    await fireEvent.press(screen.getByText('Cancelar'));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByText('¿Importar 2 resultados?')).toBeNull();
  });

  it('imports nothing when the sheet is dismissed', async () => {
    const { onImport } = await setup(['fx-1', 'fx-2']);
    await fireEvent.press(screen.getByText('Importar 2 resultados'));
    await fireEvent.press(screen.getByTestId('confirm-sheet-scrim'));
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByText('¿Importar 2 resultados?')).toBeNull();
  });

  it('opens nothing with no result chosen', async () => {
    const { onImport } = await setup([]);
    await fireEvent.press(screen.getByText('Elige al menos un resultado'));
    expect(screen.queryByText(/¿Importar/)).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('draws no button of its own when the host pins it outside the list', async () => {
    const view: OfficialResultsView = { kind: 'list', items: resultItemsFixture, selectedIds: ['fx-1'], importing: false, onToggle: jest.fn(), onImport: jest.fn(), onDismiss: jest.fn() };
    await render(<OfficialResultsScreen view={view} changes={[]} onUseNew={jest.fn()} onKeepCurrent={jest.fn()} footerHosted />);
    expect(screen.queryByText('Importar 1 resultado')).toBeNull();
    expect(screen.getByText('Ahora no')).toBeOnTheScreen();
  });
});

describe('ImportFooterSlot', () => {
  it('draws nothing without a list to import', async () => {
    const store = createImportFooterStore();
    await render(<ImportFooterSlot store={store} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the count of chosen results and asks before importing', async () => {
    const onImport = jest.fn();
    const store = createImportFooterStore();
    store.set({ count: 3, importing: false, onImport });
    await render(<ImportFooterSlot store={store} />);
    await fireEvent.press(screen.getByText('Importar 3 resultados'));
    expect(screen.getByText('¿Importar 3 resultados?')).toBeOnTheScreen();
    expect(onImport).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Confirmar'));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('says to choose one and opens nothing with none chosen', async () => {
    const onImport = jest.fn();
    const store = createImportFooterStore();
    store.set({ count: 0, importing: false, onImport });
    await render(<ImportFooterSlot store={store} />);
    await fireEvent.press(screen.getByText('Elige al menos un resultado'));
    expect(screen.queryByText(/¿Importar/)).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
  });
});
