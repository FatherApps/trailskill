import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { coachesFixture } from '../__fixtures__/coaches';
import { schoolNameFixture, storedOnFixture } from '../__fixtures__/athletes';
import { CoachesScreen, type CoachesContent, type CoachesScreenProps, type CoachesView } from '../screens/CoachesScreen';

const content: CoachesContent = { updatedMinutesAgo: 2, coaches: coachesFixture };

const show = async (view: CoachesView, extra: Partial<CoachesScreenProps> = {}) => {
  const actions = { onNavigate: jest.fn(), onInvite: jest.fn(), onDeactivate: jest.fn() };
  await render(<CoachesScreen width={1280} schoolName={schoolNameFixture} view={view} {...actions} {...extra} />);
  return actions;
};

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('CoachesScreen', () => {
  describe('with data', () => {
    it('shows the title, the caption, each coach with groups and number of athletes, in the coaches section', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByRole('header', { name: 'Entrenadores' })).toBeOnTheScreen();
      expect(screen.getByText('3 entrenadores · Actualizado hace 2 min')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Entrenadores' })).toBeSelected();
      expect(screen.getByLabelText(/^Paula Gutiérrez, Grupo A · Grupo B, 24 deportistas/)).toBeOnTheScreen();
      expect(screen.getByLabelText(/^Andrés Mejía, Grupo C, 1 deportista/)).toBeOnTheScreen();
      expect(screen.getByLabelText(/^Camila Ruiz, Sin grupos, 0 deportistas/)).toBeOnTheScreen();
    });

    it('invites only after the ConfirmSheet is confirmed', async () => {
      const { onInvite } = await show({ kind: 'data', content });
      expect(screen.queryByText('¿Invitar a un entrenador?')).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
      expect(screen.getByText('¿Invitar a un entrenador?')).toBeOnTheScreen();
      expect(onInvite).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Enviar invitación' }));
      expect(onInvite).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('¿Invitar a un entrenador?')).toBeNull();
    });

    it('does not invite when the ConfirmSheet is cancelled', async () => {
      const { onInvite } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getByRole('button', { name: 'Invitar entrenador' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onInvite).not.toHaveBeenCalled();
      expect(screen.queryByText('¿Invitar a un entrenador?')).toBeNull();
    });

    it('deactivates a coach only after the destructive ConfirmSheet names them and is confirmed', async () => {
      const { onDeactivate } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[1]);
      expect(screen.getByText('¿Desactivar a Andrés Mejía?')).toBeOnTheScreen();
      expect(onDeactivate).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Desactivar entrenador' }));
      expect(onDeactivate).toHaveBeenCalledTimes(1);
      expect(onDeactivate).toHaveBeenCalledWith('c2');
      expect(screen.queryByText('¿Desactivar a Andrés Mejía?')).toBeNull();
    });

    it('shows Sin dato, never an invented name, when the name is not readable', async () => {
      const { onDeactivate } = await show({ kind: 'data', content: { updatedMinutesAgo: 2, coaches: [{ ...coachesFixture[0]!, name: null, initials: '' }] } });

      expect(screen.getByLabelText(/^Sin dato, Grupo A · Grupo B, 24 deportistas/)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Desactivar' })).toHaveProp('accessibilityHint', 'Desactivar a Sin dato');

      await fireEvent.press(screen.getByRole('button', { name: 'Desactivar' }));
      expect(screen.getByText('¿Desactivar a Sin dato?')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Desactivar entrenador' }));
      expect(onDeactivate).toHaveBeenCalledWith('c1');
    });

    it('does not deactivate when the ConfirmSheet is cancelled', async () => {
      const { onDeactivate } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getAllByRole('button', { name: 'Desactivar' })[0]);
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

      expect(onDeactivate).not.toHaveBeenCalled();
    });

    it('passes the navigation to the caller', async () => {
      const { onNavigate } = await show({ kind: 'data', content });

      await fireEvent.press(screen.getByRole('tab', { name: 'Récords' }));

      expect(onNavigate).toHaveBeenCalledWith('records');
    });
  });

  describe('by width', () => {
    it('compact: a list under the title, with the top navigation', async () => {
      await show({ kind: 'data', content }, { width: 599 });

      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-layout-compact')).toBeOnTheScreen();
      expect(screen.getByTestId('console-nav-top', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByLabelText(/^Paula Gutiérrez/)).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(3);
    });

    it.each([
      [1024, 'console-nav-side'],
      [800, 'console-nav-top'],
    ])('at %s dp shows %s', async (width, testID) => {
      await show({ kind: 'data', content }, { width });

      expect(screen.getByTestId(testID, { includeHiddenElements: true })).toBeOnTheScreen();
    });
  });

  describe('the deactivate action', () => {
    const measure = (width: number) =>
      fireEvent(screen.getByTestId('coach-list'), 'layout', { nativeEvent: { layout: { width, height: 400, x: 0, y: 0 } } });
    const direction = () => StyleSheet.flatten(screen.getAllByTestId('coach-row')[0].props.style).flexDirection;

    it('sits beside each row when the list is wide enough, and below it when it is narrow', async () => {
      await show({ kind: 'data', content });
      expect(direction()).toBe('row');

      await measure(400);
      expect(direction()).toBe('column');

      await measure(700);
      expect(direction()).toBe('row');
    });
  });

  describe('view states', () => {
    it('loading shows the loading state under the title, without the invite', async () => {
      await show({ kind: 'loading' });

      expect(screen.getByRole('header', { name: 'Entrenadores' })).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
      expect(screen.queryByRole('button', { name: 'Invitar entrenador' })).toBeNull();
    });

    it('empty says who the coaches are and keeps the invite as the only action', async () => {
      await show({ kind: 'empty' });

      expect(screen.getByText('Aún no hay entrenadores')).toBeOnTheScreen();
      expect(screen.getAllByRole('button', { name: 'Invitar entrenador' })).toHaveLength(1);
    });

    it('error says what failed and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar los entrenadores')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offline with stored data shows a dated banner above the coaches', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
      expect(screen.getByLabelText(/^Paula Gutiérrez/)).toBeOnTheScreen();
    });

    it('offline without data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('No hay entrenadores guardados en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('denied says only that it is private, with no data and no invite', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Invitar entrenador' })).toBeNull();
      expect(screen.queryByLabelText(/^Paula Gutiérrez/)).toBeNull();
    });
  });
});
