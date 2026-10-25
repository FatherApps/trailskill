import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { schoolNameFixture, storedOnFixture } from '../__fixtures__/athletes';
import { measurementsFixture } from '../__fixtures__/measurements';
import {
  MeasurementsScreen,
  type MeasurementsContent,
  type MeasurementsScreenProps,
  type MeasurementsView,
} from '../screens/MeasurementsScreen';

const content: MeasurementsContent = { updatedMinutesAgo: 2, query: '', filters: {}, entries: measurementsFixture };

const show = async (view: MeasurementsView, extra: Partial<MeasurementsScreenProps> = {}) => {
  const actions = { onNavigate: jest.fn(), onQueryChange: jest.fn(), onFilterPress: jest.fn() };
  await render(<MeasurementsScreen width={1280} schoolName={schoolNameFixture} view={view} {...actions} {...extra} />);
  return actions;
};

// The React Native jest setup reports a system font scale of 2: these tests start from 100 %.
const realGet = Dimensions.get.bind(Dimensions);
beforeEach(() => {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) => ({ ...realGet(dim), fontScale: 1 }));
});
afterEach(() => jest.restoreAllMocks());

describe('MeasurementsScreen', () => {
  describe('with data', () => {
    it('shows the title, the caption with the conflicts, the filters and the log, in the measurements section', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByRole('header', { name: 'Mediciones' })).toBeOnTheScreen();
      expect(screen.getByText('4 mediciones · 1 en conflicto · Actualizado hace 2 min')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Mediciones' })).toBeSelected();
      expect(screen.getByLabelText('Buscar por nombre')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Entrenador' })).toBeOnTheScreen();
      expect(screen.getAllByTestId('measurement-entry')).toHaveLength(4);
    });

    it.each([
      [[measurementsFixture[0]], '1 medición · Actualizado hace 2 min'],
      [[measurementsFixture[0], measurementsFixture[2]], '2 mediciones · Actualizado hace 2 min'],
    ])('words the caption for %# without conflicts', async (entries, caption) => {
      await show({ kind: 'data', content: { ...content, entries } });

      expect(screen.getByText(caption)).toBeOnTheScreen();
    });

    it('flags the conflict with both versions and offers no way to resolve it', async () => {
      await show({ kind: 'data', content });

      expect(screen.getByText('Revisar', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getByLabelText('Primera versión: 33 segundos con 91 centésimas, Paula G., Tablet 2, 08:12')).toBeOnTheScreen();
      expect(screen.getByLabelText('Segunda versión: 34 segundos con 19 centésimas, Andrés M., Teléfono 5, 08:15')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /resolver|conservar|elegir|aceptar/i })).toBeNull();
    });

    it('passes the typing, the chips and the navigation to the caller', async () => {
      const { onQueryChange, onFilterPress, onNavigate } = await show({ kind: 'data', content });

      await fireEvent.changeText(screen.getByLabelText('Buscar por nombre'), 'Lu');
      await fireEvent.press(screen.getByRole('button', { name: 'Entrenador' }));
      await fireEvent.press(screen.getByRole('tab', { name: 'Autorizaciones' }));

      expect(onQueryChange).toHaveBeenCalledWith('Lu');
      expect(onFilterPress).toHaveBeenCalledWith('coach');
      expect(onNavigate).toHaveBeenCalledWith('authorizations');
    });

    it('shows the active filters', async () => {
      await show({ kind: 'data', content: { ...content, filters: { coach: 'Paula G.' } } });

      expect(screen.getByRole('button', { name: 'Entrenador: Paula G.' })).toBeSelected();
    });
  });

  describe('by width', () => {
    it('expanded: side navigation', async () => {
      await show({ kind: 'data', content }, { width: 1280 });

      expect(screen.getByTestId('console-nav-side')).toBeOnTheScreen();
    });

    it('medium: navigation on top', async () => {
      await show({ kind: 'data', content }, { width: 800 });

      expect(screen.getByTestId('console-nav-top', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it('compact: the top navigation and the log still shows every entry', async () => {
      await show({ kind: 'data', content }, { width: 599 });

      expect(screen.queryByTestId('console-nav-side')).toBeNull();
      expect(screen.getByTestId('console-layout-compact')).toBeOnTheScreen();
      expect(screen.getByTestId('console-nav-top', { includeHiddenElements: true })).toBeOnTheScreen();
      expect(screen.getAllByTestId('measurement-entry')).toHaveLength(4);
    });
  });

  describe('view states', () => {
    it('loading shows the loading state under the title, without the filters', async () => {
      await show({ kind: 'loading' });

      expect(screen.getByRole('header', { name: 'Mediciones' })).toBeOnTheScreen();
      expect(screen.getByTestId('state-view')).toHaveProp('accessibilityState', { busy: true });
      expect(screen.queryByLabelText('Buscar por nombre')).toBeNull();
    });

    it('empty says what will appear and who creates it', async () => {
      await show({ kind: 'empty' });

      expect(screen.getByText('Aún no hay mediciones')).toBeOnTheScreen();
      expect(screen.getByText('Aparecen cuando los entrenadores registran tiempos de los deportistas.')).toBeOnTheScreen();
    });

    it('error says what failed and retries', async () => {
      const onRetry = jest.fn();
      await show({ kind: 'error', onRetry });

      expect(screen.getByText('No pudimos cargar las mediciones')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Intentar de nuevo' }));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('offline with stored data shows a dated banner above the log', async () => {
      await show({ kind: 'offline', storedOn: storedOnFixture, content });

      expect(screen.getByTestId('banner')).toHaveTextContent(
        'Estás sin conexión Mostramos lo guardado en este dispositivo el 23 de octubre de 2026.',
      );
      expect(screen.getAllByTestId('measurement-entry')).toHaveLength(4);
    });

    it('offline without data uses the offline state', async () => {
      await show({ kind: 'offline-empty' });

      expect(screen.getByText('No hay mediciones guardadas en este dispositivo. Aparecerán cuando vuelva la conexión.')).toBeOnTheScreen();
    });

    it('denied says only that it is private, with no data', async () => {
      await show({ kind: 'denied' });

      expect(screen.getByText('Esta información es privada')).toBeOnTheScreen();
      expect(screen.queryByTestId('measurement-entry')).toBeNull();
    });
  });
});
