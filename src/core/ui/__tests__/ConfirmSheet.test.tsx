import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { colors, contrastRatio, type ThemeName } from '../../theme';
import { ConfirmSheet, confirmSheetColors } from '..';

const themes: ThemeName[] = ['light', 'dark'];

async function renderSheet(props: Partial<Parameters<typeof ConfirmSheet>[0]> = {}) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  await render(
    <ConfirmSheet
      visible
      title="¿Descartar este tiempo?"
      message="El tiempo 0:33,91 de Mateo C. no se guardará. No se puede recuperar."
      confirmLabel="Descartar tiempo"
      cancelLabel="Seguir revisando"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

function modalOf() {
  const [modal] = screen.container.queryAll((node) => typeof node.props.onRequestClose === 'function');
  return modal;
}

describe('ConfirmSheet', () => {
  it('asks a question with the consequence and two labelled actions', async () => {
    const { onConfirm, onCancel } = await renderSheet();

    expect(screen.getByRole('header', { name: '¿Descartar este tiempo?' })).toBeOnTheScreen();
    expect(screen.getByText(/no se guardará/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Descartar tiempo' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir revisando' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Android back takes the safe option', async () => {
    const { onConfirm, onCancel } = await renderSheet();

    const modal = modalOf();
    await fireEvent(modal, 'requestClose');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tapping the scrim also takes the safe option', async () => {
    const { onConfirm, onCancel } = await renderSheet();

    await fireEvent.press(screen.getByTestId('confirm-sheet-scrim'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('uses the native Modal with a slide animation', async () => {
    await renderSheet();

    const modal = modalOf();
    expect(modal.props.animationType).toBe('slide');
    expect(modal.props.transparent).toBe(true);
  });

  it('a destructive decision uses the stop button, a non-destructive one the primary button', async () => {
    await renderSheet();
    const stop = StyleSheet.flatten(screen.getByRole('button', { name: 'Descartar tiempo' }).props.style);
    expect(stop.backgroundColor).toBe(colors.light.stop);

    await screen.rerender(
      <ConfirmSheet
        visible
        title="¿Importar 13 resultados?"
        message="Se agregarán al historial de Sara P."
        confirmLabel="Importar 13 resultados"
        cancelLabel="Revisar primero"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const primary = StyleSheet.flatten(screen.getByRole('button', { name: 'Importar 13 resultados' }).props.style);
    expect(primary.backgroundColor).toBe(colors.light.action);
  });

  it('renders nothing while hidden', async () => {
    await renderSheet({ visible: false });
    expect(screen.queryByRole('header')).toBeNull();
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const c = colors[theme];

    it('title and consequence are at least 4.5:1 on the sheet', () => {
      for (const text of [confirmSheetColors.title, confirmSheetColors.message]) {
        expect(contrastRatio(c[text], c[confirmSheetColors.background])).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
