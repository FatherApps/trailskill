import { fireEvent, render, screen } from '@testing-library/react-native';

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
});
