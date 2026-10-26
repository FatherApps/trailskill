import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../../core/theme';
import type { OpenConflict } from '../data/conflictReview';
import { ReviewConflictsScreen, type ReviewConflictsScreenProps } from '../screens/ReviewConflictsScreen';

// Synthetic data only. Local dates keep the expected text the same in every time zone.
const at = (hour: number, minute: number) => new Date(2026, 9, 25, hour, minute).toISOString();
const conflict: OpenConflict = {
  id: 'conflict-1',
  expectedVersion: 3,
  athleteName: 'Mateo C.',
  event: { stroke: 'FR', distance: '50m', pool: 'SCM' },
  current: { hundredths: 3520, author: 'Coach Uno', device: 'Teléfono A', at: at(14, 0) },
  incoming: { hundredths: 3480, author: null, device: null, at: at(14, 5) },
};
const second: OpenConflict = { ...conflict, id: 'conflict-2', athleteName: 'Sofía R.', event: { stroke: 'BK', distance: '100m', pool: 'SCM' } };

function renderScreen(props: Partial<ReviewConflictsScreenProps> = {}) {
  const callbacks = { onResolve: jest.fn(), onRetry: jest.fn(), onBack: jest.fn() };
  return render(
    <ThemeProvider>
      <ReviewConflictsScreen view="ready" conflicts={[conflict, second]} offline={false} {...callbacks} {...props} />
    </ThemeProvider>,
  ).then(() => callbacks);
}

const open = (name: string) => fireEvent.press(screen.getByRole('button', { name: new RegExp(name) }));
const resolve = () => fireEvent.press(screen.getByRole('button', { name: 'Resolver conflicto' }));
const reasonField = () => screen.getByLabelText('Motivo');

describe('ReviewConflictsScreen', () => {
  it('lists the open conflicts with the athlete and the event', async () => {
    await renderScreen();

    expect(screen.getByText('Mateo C.')).toBeOnTheScreen();
    expect(screen.getByText('Sofía R.')).toBeOnTheScreen();
    expect(screen.getByText(/Libre 50 m/)).toBeOnTheScreen();
    expect(screen.getByText(/Espalda 100 m/)).toBeOnTheScreen();
  });

  it('shows both versions side by side with the author, the device and the time', async () => {
    await renderScreen();
    await open('Mateo C.');

    expect(screen.getByText('Versión guardada')).toBeOnTheScreen();
    expect(screen.getByText('Versión recibida')).toBeOnTheScreen();
    expect(screen.getByText('35,20')).toBeOnTheScreen();
    expect(screen.getByText('34,80')).toBeOnTheScreen();
    expect(screen.getByText('Coach Uno')).toBeOnTheScreen();
    expect(screen.getByText('Teléfono A')).toBeOnTheScreen();
    expect(screen.getByText('25/10/2026 14:00')).toBeOnTheScreen();
    expect(screen.getByText('25/10/2026 14:05')).toBeOnTheScreen();
    // The incoming version has no known author or device.
    expect(screen.getByText('Autor desconocido')).toBeOnTheScreen();
    expect(screen.getByText('Dispositivo desconocido')).toBeOnTheScreen();
  });

  it('does not send a resolution without a reason', async () => {
    const { onResolve } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.changeText(reasonField(), '   ');
    await resolve();

    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el motivo para resolver.')).toBeOnTheScreen();
  });

  it('resolves with the saved version by default, with the expected version and the reason', async () => {
    const { onResolve } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.changeText(reasonField(), '  Cronómetro más fiable ');
    await resolve();

    expect(onResolve).toHaveBeenCalledWith({
      conflictId: 'conflict-1',
      expectedVersion: 3,
      decision: 'current',
      hundredths: null,
      reason: 'Cronómetro más fiable',
    });
  });

  it('resolves with the received version', async () => {
    const { onResolve } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.press(screen.getByRole('radio', { name: 'Usar la recibida' }));
    await fireEvent.changeText(reasonField(), 'Llegó con video');
    await resolve();

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ decision: 'incoming', hundredths: null }));
  });

  it('resolves with a typed time', async () => {
    const { onResolve } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.press(screen.getByRole('radio', { name: 'Escribir otro tiempo' }));
    await fireEvent.changeText(screen.getByLabelText('Tiempo correcto'), '34,05');
    await fireEvent.changeText(reasonField(), 'Revisado en video');
    await resolve();

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ decision: 'value', hundredths: 3405 }));
  });

  it('resolves an emptied time field as a missing time, never zero', async () => {
    const { onResolve } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.press(screen.getByRole('radio', { name: 'Escribir otro tiempo' }));
    await fireEvent.changeText(reasonField(), 'No hubo llegada');
    await resolve();

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ decision: 'value', hundredths: null }));
  });

  it('does not send a time it cannot read', async () => {
    const { onResolve } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.press(screen.getByRole('radio', { name: 'Escribir otro tiempo' }));
    await fireEvent.changeText(screen.getByLabelText('Tiempo correcto'), 'abc');
    await fireEvent.changeText(reasonField(), 'Motivo');
    await resolve();

    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el tiempo como 35,20 o 1:05,30.')).toBeOnTheScreen();
  });

  it('says resolving needs a signal and keeps what was typed when offline', async () => {
    const { onResolve } = await renderScreen({ offline: true });
    await open('Mateo C.');
    await fireEvent.changeText(reasonField(), 'Motivo escrito');
    await resolve();

    expect(onResolve).not.toHaveBeenCalled();
    expect(screen.getByText(/Resolver un conflicto requiere señal/)).toBeOnTheScreen();
    expect(reasonField().props.value).toBe('Motivo escrito');
  });

  it('keeps what was typed when the server rejects the resolution and says why', async () => {
    await renderScreen({ failure: 'stale' });
    await open('Mateo C.');
    await fireEvent.changeText(reasonField(), 'Motivo escrito');

    expect(screen.getByText('La medición cambió mientras la revisabas. Recarga y vuelve a revisarla.')).toBeOnTheScreen();
    expect(reasonField().props.value).toBe('Motivo escrito');
  });

  it('goes back from the detail to the list, and from the list to the previous screen', async () => {
    const { onBack } = await renderScreen();
    await open('Mateo C.');
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByText('Sofía R.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the empty, error and offline states', async () => {
    const { onRetry } = await renderScreen({ view: 'empty', conflicts: [] });
    expect(screen.getByText('No hay conflictos abiertos')).toBeOnTheScreen();
    await screen.unmount();

    const again = await renderScreen({ view: 'error', conflicts: [] });
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(again.onRetry).toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });
});
